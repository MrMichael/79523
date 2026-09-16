import type { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import type { ClientEvents, ServerEvents, BoxerState } from './types'
import { createPlayer, createAIPlayer, createPlayerForAccount, getPlayer, setPlayerReady, setPlayerConnected, resetPlayerReady } from './player'
import { createRoom, getRoom, joinRoom, leaveRoom, getAllRooms } from './room'
import { initGame, handlePlay, handlePass, settleGame, getBoxerScoreCards, getBoxerParticipants, executeSurrenderSwap, verifyScoreTotal, removeCardFromHand, getScoreTieGroups, removeGamePlayer } from './game-machine'
import { Rank, calculateScore, isScoreCard, resolveRound, getWinner, BoxerMove, compareCards, identify, choosePlay, chooseBoxerMove, chooseSurrenderGive, chooseSurrenderPick, chooseSurrenderReturn, getSmallestCard } from '@79523/engine'
import { verifyToken } from './auth'
import { findUserById } from './db'
import { bindOnline, markOnline, markOffline, isOnline, getIO } from './online'
import { broadcastLobby } from './lobby'
import { persistGameStats } from './stats'
import type { Card } from '@79523/engine'

import type { Room } from './types'

/** Socket.IO server instance type (client→server events, server→client events). */
type WsServer = Server<ClientEvents, ServerEvents>

function serializePlayers(players: Room['players']) {
  return players.map(p => ({ id: p.id, name: p.name, ready: p.ready, connected: p.connected, isHost: p.isHost, wins: p.wins, boxerWins: p.boxerWins, isAI: !!p.isAI }))
}

/** Emit draw_card to all non-finished players after a round ends */
function emitDrawCards(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room) {
  for (const gp of game.players) {
    if (!gp.finished) {
      const p = room.players.find(rp => rp.id === gp.id)
      if (p && !p.isAI) io.to(p.socketId).emit('draw_card', { hand: gp.hand, deckCount: game.deck.length })
    }
  }
}

// ── Boxer flow ──

function startBoxerRound(io: WsServer, roomCode: string, game: NonNullable<Room['game']>) {
  clearBoxerTimers(roomCode)
  const bs = game.boxerState!
  const card = bs.scoreCards[bs.currentCardIndex]
  bs.currentSurvivors = getBoxerParticipants(game)
  bs.currentMoves.clear()
  bs.round = 0
  bs.resolveLocked = false
  const room = getRoom(roomCode)
  const gameScores: Record<string, number> = {}
  const boxerWins: Record<string, number> = {}
  for (const p of game.players) gameScores[p.id] = p.score
  for (const rp of room?.players || []) boxerWins[rp.id] = rp.boxerWins
  io.to(roomCode).emit('boxer_start', {
    scoreCard: card,
    participants: [...bs.currentSurvivors],
    gameScores,
    boxerWins,
  })
  scheduleBotBoxer(io, roomCode, game)
}

function processBoxerRound(io: WsServer, roomCode: string, game: NonNullable<Room['game']>) {
  clearBoxerTimers(roomCode)
  const bs = game.boxerState!
  bs.round++

  const survivors = resolveRound(bs.currentMoves)

  const moveMap: Record<string, string> = {}
  for (const [id, move] of bs.currentMoves) moveMap[id] = move
  io.to(roomCode).emit('boxer_reveal', { moves: moveMap })

  if (survivors.length === 1) {
    const winnerId = getWinner(survivors)
    const card = bs.scoreCards[bs.currentCardIndex]
    const winner = game.players.find(p => p.id === winnerId)!
    winner.hasBoxerBadge = true
    winner.boxerWins++
    winner.score += isScoreCard(card) ? calculateScore([card]) : 0

    // Track boxer wins
    const room = getRoom(roomCode)
    const roomPlayer = room?.players.find(p => p.id === winnerId)
    if (roomPlayer) roomPlayer.boxerWins++

    const winPoints = isScoreCard(card) ? calculateScore([card]) : 0
    io.to(roomCode).emit('boxer_winner', {
      playerId: winnerId, scoreCard: card, points: winPoints,
      scores: game.players.map(p => ({ id: p.id, score: p.score })),
    })

    bs.currentCardIndex++
    if (bs.currentCardIndex < bs.scoreCards.length) {
      setTimeout(() => startBoxerRound(io, roomCode, game), boxerDelayMs())
    } else {
      setTimeout(() => resolveBoxerChampion(io, roomCode, game), boxerDelayMs())
    }
  } else {
    const eliminated = bs.currentSurvivors.filter(id => !survivors.includes(id))
    for (const id of eliminated) io.to(roomCode).emit('boxer_eliminated', { playerId: id })
    bs.currentSurvivors = survivors
    bs.currentMoves.clear()
    bs.resolveLocked = false
    // Delay next round so survivors can see the reveal
    const room = getRoom(roomCode)
    setTimeout(() => {
      if (!game.boxerState || game.boxerState.currentSurvivors !== survivors) return // state changed
      for (const id of survivors) {
        const p = room?.players.find(rp => rp.id === id)
        if (p) io.to(p.socketId).emit('boxer_start', {
          scoreCard: bs.scoreCards[bs.currentCardIndex],
          participants: [...survivors],
        })
      }
      scheduleBotBoxer(io, roomCode, game)
    }, boxerDelayMs())
  }
}

/**
 * Resolve a boxer round once every present survivor has a move (or only one survivor remains).
 * Shared by the `boxer_move` handler and the player-leave repair path.
 */
function maybeResolveBoxer(io: WsServer, roomCode: string, game: NonNullable<Room['game']>) {
  const bs = game.boxerState
  if (!bs || bs.currentSurvivors.length === 0) return
  // A round must be resolved at most once: the winner branch keeps currentMoves around for the
  // reveal, so a late timer / a player leaving / a re-click would otherwise resolve it again —
  // burning an extra boxer round and skipping a score card. The lock is cleared when the next
  // round is set up (startBoxerRound / startBoxerTiebreakRound / a survivors>1 sub-round).
  if (bs.resolveLocked) return
  if (bs.currentMoves.size < bs.currentSurvivors.length) {
    // Sole survivor doesn't need to submit a move — treat them as the winner.
    if (bs.currentSurvivors.length !== 1) return
    bs.currentMoves.set(bs.currentSurvivors[0], BoxerMove.Rock)
  }
  bs.resolveLocked = true
  if (bs.scoreCards.length === 0) resolveBoxerTiebreakRound(io, roomCode, game)
  else processBoxerRound(io, roomCode, game)
}

/**
 * Schedule boxer moves: AI submit quickly, humans get a timeout fallback so the round
 * never deadlocks waiting on an unresponsive player.
 */
let boxerTimers = new Map<string, ReturnType<typeof setTimeout>[]>()

/** Cancel pending boxer-move timers. `game.boxerState` is reused across rounds, so a stale
 *  timer from a previous round would otherwise auto-submit the player's move in a later one. */
function clearBoxerTimers(roomCode: string) {
  const arr = boxerTimers.get(roomCode)
  if (!arr) return
  for (const t of arr) clearTimeout(t)
  boxerTimers.delete(roomCode)
}

function scheduleBotBoxer(io: WsServer, roomCode: string, game: NonNullable<Room['game']>) {
  const bs = game.boxerState
  if (!bs) return
  const room = getRoom(roomCode)
  const humanTimeout = Number(process.env.BOXER_TIMEOUT_MS) || 15000
  const timers = boxerTimers.get(roomCode) || []
  boxerTimers.set(roomCode, timers)
  for (const id of bs.currentSurvivors) {
    if (bs.currentMoves.has(id)) continue
    const rp = room?.players.find(p => p.id === id)
    // AI and offline (auto-managed / 托管) players punch promptly.
    const delay = rp?.isAI || !rp?.connected ? botDelayMs() : humanTimeout
    const t = setTimeout(() => {
      const cur = game.boxerState
      if (cur !== bs) return
      if (!cur.currentSurvivors.includes(id) || cur.currentMoves.has(id)) return
      cur.currentMoves.set(id, chooseBoxerMove())
      maybeResolveBoxer(io, roomCode, game)
    }, delay)
    timers.push(t)
  }
}

/** Auto-act for an AI surrender actor (give largest / pick best / return smallest). */
function scheduleBotSurrender(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room) {
  const ss = room.surrenderState
  if (!ss) return
  const actorId = ss.phase === 'losers_give' ? ss.loserIds[ss.currentPairIndex] : ss.winnerIds[ss.currentPairIndex]
  const actor = room.players.find(p => p.id === actorId)
  // Only AI, or a human who is offline (auto-managed / 托管) — present players choose themselves.
  if (!actor || (!actor.isAI && actor.connected)) return
  setTimeout(() => {
    if (room.surrenderState !== ss) return
    const gp = game.players.find(p => p.id === actorId)
    if (!gp) return
    if (ss.phase === 'losers_give') {
      processSurrenderGive(io, roomCode, actorId, chooseSurrenderGive(gp.hand), room, game)
    } else if (ss.phase === 'winners_pick' && ss.surrenderedCards.length > 0) {
      processSurrenderPick(io, roomCode, actorId, chooseSurrenderPick(ss.surrenderedCards.map(sc => sc.card)), room, game)
    } else if (ss.phase === 'winners_return' && gp.hand.length > 0) {
      processSurrenderReturn(io, roomCode, actorId, chooseSurrenderReturn(gp.hand), room, game)
    }
  }, botDelayMs())
}

function resolveBoxerChampion(io: WsServer, roomCode: string, game: NonNullable<Room['game']>) {
  // Step 1: Resolve boxer champion tie (most boxer wins)
  const maxWins = Math.max(...game.players.map(p => p.boxerWins))
  const champions = game.players.filter(p => p.boxerWins === maxWins)

  if (champions.length > 1 && maxWins > 0) {
    log('BOXER_TIEBREAK', roomCode, `tied=${champions.map(p => p.id).join(',')} wins=${maxWins}`)
    io.to(roomCode).emit('boxer_tiebreak', {
      participants: champions.map(p => p.id),
      info: `${champions.map(p => {
        const rp = getRoom(roomCode)?.players.find(r => r.id === p.id)
        return rp?.name || p.id
      }).join(' vs ')} 拳王决胜局！`,
      wins: maxWins,
    })
    game.boxerState = {
      scoreCards: [], currentCardIndex: 0,
      currentSurvivors: champions.map(p => p.id),
      currentMoves: new Map(), round: 0,
    }
    setTimeout(() => startBoxerTiebreakRound(io, roomCode, game), boxerDelayMs())
    return
  }

  // Step 2: Resolve score-based ranking ties
  resolveScoreRankings(io, roomCode, game)
}

/** Find tied score groups and run ranking tiebreakers to produce unique ordering */
function resolveScoreRankings(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, startGroupIdx = 0) {
  const tiedGroups = getScoreTieGroups(game)

  if (tiedGroups.length === 0 || startGroupIdx >= tiedGroups.length) {
    finishBoxerFlow(io, roomCode, game)
    return
  }

  const group = tiedGroups[startGroupIdx]
  const room = getRoom(roomCode)
  const names = group.playerIds.map(id => room?.players.find(r => r.id === id)?.name || id).join(' vs ')
  log('SCORE_TIEBREAK', roomCode, `score=${group.score} players=${group.playerIds.join(',')}`)

  io.to(roomCode).emit('boxer_tiebreak', {
    participants: group.playerIds,
    info: `${names} 排位决胜局！(${group.score}分并列)`,
  })

  game.boxerState = {
    scoreCards: [], currentCardIndex: 0,
    currentSurvivors: [...group.playerIds],
    currentMoves: new Map(), round: 0,
    tieGroupIndex: startGroupIdx,
  }
  setTimeout(() => startBoxerTiebreakRound(io, roomCode, game), boxerDelayMs())
}

function startBoxerTiebreakRound(io: WsServer, roomCode: string, game: NonNullable<Room['game']>) {
  clearBoxerTimers(roomCode)
  const bs = game.boxerState!
  bs.currentMoves.clear()
  bs.round = 0
  bs.resolveLocked = false
  const room = getRoom(roomCode)
  const gameScores: Record<string, number> = {}
  const boxerWins: Record<string, number> = {}
  for (const p of game.players) gameScores[p.id] = p.score
  for (const rp of room?.players || []) boxerWins[rp.id] = rp.boxerWins

  for (const id of bs.currentSurvivors) {
    const p = room?.players.find(rp => rp.id === id)
    if (p) io.to(p.socketId).emit('boxer_start', {
      scoreCard: null, // tiebreaker: no score card
      participants: [...bs.currentSurvivors],
      gameScores,
      boxerWins,
    })
  }
  // Other players get spectator view
  const allIds = game.players.map(p => p.id)
  for (const id of allIds) {
    if (!bs.currentSurvivors.includes(id)) {
      const p = room?.players.find(rp => rp.id === id)
      if (p) io.to(p.socketId).emit('boxer_start', {
        scoreCard: null,
        participants: [...bs.currentSurvivors],
        gameScores,
        boxerWins,
        spectators: true,
      })
    }
  }
  scheduleBotBoxer(io, roomCode, game)
}

/** Resolve tiebreaker round: first player to win becomes champion */
function resolveBoxerTiebreakRound(io: WsServer, roomCode: string, game: NonNullable<Room['game']>) {
  clearBoxerTimers(roomCode)
  const bs = game.boxerState!
  bs.round++

  const survivors = resolveRound(bs.currentMoves)
  const moveMap: Record<string, string> = {}
  for (const [id, move] of bs.currentMoves) moveMap[id] = move
  io.to(roomCode).emit('boxer_reveal', { moves: moveMap })

  if (survivors.length === 1) {
    const championId = getWinner(survivors)
    // Assign tiebreak order within score group: winner=0, others=1,2...
    const groupScore = game.players.find(p => p.id === survivors[0])!.score
    let order = 0
    for (const p of game.players) {
      if (p.score === groupScore) {
        p.tiebreakOrder = p.id === championId ? 0 : ++order
      }
    }
    const champion = game.players.find(p => p.id === championId)!
    champion.hasBoxerBadge = true
    champion.boxerWins++
    const room = getRoom(roomCode)
    const roomPlayer = room?.players.find(p => p.id === championId)
    if (roomPlayer) roomPlayer.boxerWins++

    io.to(roomCode).emit('boxer_champion', {
      playerId: championId,
      scores: game.players.map(p => ({ id: p.id, score: p.score })),
    })

    log('BOXER_CHAMPION', roomCode, championId)
    setTimeout(() => {
      const nextIdx = bs.tieGroupIndex !== undefined ? bs.tieGroupIndex + 1 : 0
      resolveScoreRankings(io, roomCode, game, nextIdx)
    }, boxerDelayMs())
  } else {
    const eliminated = bs.currentSurvivors.filter(id => !survivors.includes(id))
    for (const id of eliminated) io.to(roomCode).emit('boxer_eliminated', { playerId: id })
    bs.currentSurvivors = survivors
    bs.currentMoves.clear()
    bs.resolveLocked = false

    setTimeout(() => {
      if (!game.boxerState || game.boxerState.currentSurvivors !== survivors) return
      const room = getRoom(roomCode)
      for (const id of survivors) {
        const p = room?.players.find(rp => rp.id === id)
        if (p) io.to(p.socketId).emit('boxer_start', {
          scoreCard: null,
          participants: [...survivors],
        })
      }
      scheduleBotBoxer(io, roomCode, game)
    }, boxerDelayMs())
  }
}

function finishBoxerFlow(io: WsServer, roomCode: string, game: NonNullable<Room['game']>) {
  const room = getRoom(roomCode)
  if (!room) return
  game.boxerState = null
  clearBoxerTimers(roomCode)

  const sorted = [...game.players].sort((a, b) => b.score - a.score || a.tiebreakOrder - b.tiebreakOrder)
  const pc = game.players.length

  // 🏆 胜局徽章与排行榜口径一致：按拳王分配后的最终排名第一结算
  if (sorted.length > 0) {
    const gameWinner = room.players.find(p => p.id === sorted[0].id)
    if (gameWinner) gameWinner.wins++
  }

  // Persist cumulative account stats (skips AI / removed accounts).
  const playSeconds = Math.max(0, Math.round((Date.now() - (room.gameStartedAt ?? Date.now())) / 1000))
  persistGameStats(game.players.map(p => ({ id: p.id, rank1: sorted[0]?.id === p.id, boxerWins: p.boxerWins, playSeconds })))
  log('GAME_END', roomCode, `rank1=${sorted[0]?.id} pc=${pc} play=${playSeconds}s`)

  // Save surrender info for after next game's cards are dealt
  room.pendingSurrender = {
    winnerIds: pc < 4 ? [sorted[0].id] : sorted.slice(0, 2).map(p => p.id),
    loserIds: pc < 4 ? [sorted[sorted.length - 1].id] : sorted.slice(-2).map(p => p.id),
  }

  // Game is finished — allow the next start_game and reflect it in the lobby.
  room.game = null
  broadcastLobby()

  // Option B: a seat is kept for the whole game; now that it's over, re-arm the normal
  // disconnect grace for any seat that is still offline (removes them if they never return).
  for (const rp of room.players) {
    if (!rp.isAI && !rp.connected) scheduleDisconnectRemoval(io, roomCode, rp.id, disconnectKickMs())
  }

  // Timing: boxer end → 2s → settlement → 3s → leaderboard
  setTimeout(() => {
    io.to(roomCode).emit('scores_updated', {
      scores: sorted.map(p => ({ id: p.id, totalScore: p.score })),
    })

    // Emit cumulative room stats for ranking popup
    io.to(roomCode).emit('room_stats_updated', {
      stats: room.players.map(rp => ({ id: rp.id, name: rp.name, wins: rp.wins, boxerWins: rp.boxerWins })),
    })

    setTimeout(() => {
      io.to(roomCode).emit('next_game_lead', { playerId: '' })
    }, 3000)
  }, flowDelayMs())
}

// ── Helper: emit game_started + your_turn ──
function emitGameStart(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room, swaps: any[]) {
  const leadPlayerId = game.players[game.currentPlayerIndex].id
  const playerNames: Record<string, string> = {}
  for (const p of room.players) playerNames[p.id] = p.name
  for (const player of room.players) {
    const gp = game.players.find(p => p.id === player.id)!
    io.to(player.socketId).emit('game_started', {
      hand: gp.hand,
      players: game.players.map(p => {
        const rp = room.players.find(r => r.id === p.id)
        return { ...p, hand: [], cardCount: p.hand.length, wins: rp?.wins || 0, boxerWins: rp?.boxerWins || 0, connected: rp?.connected ?? true }
      }),
      leadPlayerId,
      playerNames,
      myId: player.id,
      deckCount: game.deck.length,
    })
  }
  // Emit surrender result if applicable
  if (swaps.length > 0) {
    io.to(roomCode).emit('surrender_swap', {
      losers: swaps.map((s: any) => ({ id: s.loserId, gaveUpCard: s.gaveUpCard, receivedCard: s.receivedCard })),
    })
  }
  promptTurn(io, roomCode, game, room, leadPlayerId)
}

// ── Surrender flow (manual) ──

// Auto-complete the whole surrender if no player responds in time (SURRENDER_TIMEOUT_MS).
function surrenderTimeoutMs(): number {
  return Number(process.env.SURRENDER_TIMEOUT_MS) || 30000
}

// ── Logging ──
const log = (evt: string, roomCode: string, detail?: any) => {
  const ts = new Date().toISOString().slice(11, 19)
  const extra = detail ? ' ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''
  console.log(`[${ts}] [${roomCode}] ${evt}${extra}`)
}

function resetSurrenderTimer(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room) {
  if ((room as any).__surrenderTimer) {
    clearTimeout((room as any).__surrenderTimer)
    ;(room as any).__surrenderTimer = null
  }
  const timer = setTimeout(() => {
    ;(room as any).__surrenderTimer = null
    if (game.gameOver || game.boxerState) return
    const ss = room.surrenderState
    if (!ss) return
    log('SURRENDER_TIMEOUT', roomCode, `phase=${ss.phase} pair=${ss.currentPairIndex}`)
    const { swaps, nextLeadPlayerId } = executeSurrenderSwap(game, { loserIds: ss.loserIds, winnerIds: ss.winnerIds })
    log('SURRENDER_TIMEOUT_DONE', roomCode, `swaps=${swaps.length} lead=${nextLeadPlayerId}`)
    if (nextLeadPlayerId) {
      const leadIdx = game.players.findIndex(p => p.id === nextLeadPlayerId)
      if (leadIdx >= 0) game.currentPlayerIndex = leadIdx
    }
    if (swaps.length > 0) {
      io.to(roomCode).emit('surrender_swap', {
        losers: swaps.map((s: any) => ({ id: s.loserId, gaveUpCard: s.gaveUpCard, receivedCard: s.receivedCard })),
      })
    }
    // Sync all players' hands after auto-complete swap
    for (const gp of game.players) {
      const rp = room.players.find(p => p.id === gp.id)
      if (rp) io.to(rp.socketId).emit('draw_card', { hand: gp.hand, deckCount: game.deck.length })
    }
    const leadGp = game.players[game.currentPlayerIndex]
    room.surrenderState = null
    promptTurn(io, roomCode, game, room, leadGp.id)
  }, surrenderTimeoutMs())
  ;(room as any).__surrenderTimer = timer
}

function sendSurrenderPrompt(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room, onlyPlayerId?: string) {
  const ss = room.surrenderState!
  log('SURRENDER_PROMPT', roomCode, `phase=${ss.phase} pair=${ss.currentPairIndex}`)
  // Only arm timers for a fresh prompt; a reconnect resend must not extend them.
  if (!onlyPlayerId) {
    resetSurrenderTimer(io, roomCode, game, room)
    scheduleBotSurrender(io, roomCode, game, room)
  }
  const gp = (id: string) => game.players.find(p => p.id === id)!
  const send = (playerId: string, payload: any) => {
    if (onlyPlayerId && onlyPlayerId !== playerId) return
    const rp = room.players.find(p => p.id === playerId)
    if (rp) io.to(rp.socketId).emit('surrender_start', payload)
  }

  if (ss.phase === 'losers_give') {
    const loserId = ss.loserIds[ss.currentPairIndex]
    const loser = room.players.find(p => p.id === loserId)
    if (!loser) return
    send(loserId, {
      phase: 'losers_give',
      yourRole: 'loser',
      hand: gp(loserId).hand,
      info: `请选择你手中最大的单张牌上缴`,
    })
    for (const p of room.players) {
      if (p.id === loserId) continue
      const role = ss.winnerIds.includes(p.id) ? 'winner' : 'spectator'
      send(p.id, {
        phase: 'losers_give',
        yourRole: role as 'winner' | 'spectator',
        hand: gp(p.id).hand,
        info: `等待 ${loser.name} 上缴最大牌...`,
      })
    }
  } else if (ss.phase === 'winners_pick') {
    const winnerId = ss.winnerIds[ss.currentPairIndex]
    const winner = room.players.find(p => p.id === winnerId)
    if (!winner) return

    const surrenderedInfos = ss.surrenderedCards.map(sc => {
      const lp = room.players.find(rp => rp.id === sc.playerId)
      return { playerId: sc.playerId, playerName: lp?.name || '?', card: sc.card }
    })

    send(winnerId, {
      phase: 'winners_pick',
      yourRole: 'winner',
      hand: gp(winnerId).hand,
      info: `请从对手上缴的牌中挑选一张`,
      surrenderedCards: surrenderedInfos,
    })
    for (const p of room.players) {
      if (p.id === winnerId) continue
      send(p.id, {
        phase: 'winners_pick',
        yourRole: 'spectator',
        hand: gp(p.id).hand,
        info: `等待 ${winner.name} 挑选牌...`,
      })
    }
  } else if (ss.phase === 'winners_return') {
    const winnerId = ss.winnerIds[ss.currentPairIndex]
    const winner = room.players.find(p => p.id === winnerId)
    if (!winner || !ss.pendingPick) return

    send(winnerId, {
      phase: 'winners_return',
      yourRole: 'winner',
      hand: gp(winnerId).hand,
      info: `请选择一张牌还给对手`,
    })
    for (const p of room.players) {
      if (p.id === winnerId) continue
      send(p.id, {
        phase: 'winners_return',
        yourRole: 'spectator',
        hand: gp(p.id).hand,
        info: `等待 ${winner.name} 返还牌...`,
      })
    }
  }
}

function processSurrenderGive(io: WsServer, roomCode: string, playerId: string, card: Card, room: Room, game: NonNullable<Room['game']>) {
  const ss = room.surrenderState!
  if (ss.phase !== 'losers_give') return
  if (ss.loserIds[ss.currentPairIndex] !== playerId) return

  log('SURRENDER_GIVE', roomCode, `loser=${playerId}`)
  // Remove ONE card from loser's hand (use removeCardFromHand to handle duplicates)
  const loserGp = game.players.find(p => p.id === playerId)!
  loserGp.hand = removeCardFromHand(loserGp.hand, card)
  ss.surrenderedCards.push({ playerId, card })

  // Notify all players of the surrender
  io.to(roomCode).emit('surrender_update', {
    phase: 'losers_give',
    info: `${room.players.find(p => p.id === playerId)?.name || '?'} 上缴了一张牌`,
    surrenderedCards: ss.surrenderedCards,
  })

  // Move to next loser or to winners_pick
  ss.currentPairIndex++
  if (ss.currentPairIndex < ss.loserIds.length) {
    sendSurrenderPrompt(io, roomCode, game, room)
  } else {
    // All losers gave, move to winners pick
    ss.phase = 'winners_pick'
    ss.currentPairIndex = 0
    sendSurrenderPrompt(io, roomCode, game, room)
  }
}

function processSurrenderPick(io: WsServer, roomCode: string, playerId: string, card: Card, room: Room, game: NonNullable<Room['game']>) {
  const ss = room.surrenderState!
  if (ss.phase !== 'winners_pick') return
  if (ss.winnerIds[ss.currentPairIndex] !== playerId) return

  // Verify card is in surrendered list
  const scIdx = ss.surrenderedCards.findIndex(sc => sc.card.suit === card.suit && sc.card.rank === card.rank)
  if (scIdx < 0) return

  // Remove picked card from surrendered list, add to winner's hand
  const pickedCard = ss.surrenderedCards[scIdx].card
  ss.surrenderedCards.splice(scIdx, 1)
  const winnerGp = game.players.find(p => p.id === playerId)!
  winnerGp.hand.push(pickedCard)
  ss.pendingPick = { winnerId: playerId, card: pickedCard }
  log('SURRENDER_PICK', roomCode, `winner=${playerId}`)

  io.to(roomCode).emit('surrender_update', {
    phase: 'winners_pick',
    info: `${room.players.find(p => p.id === playerId)?.name || '?'} 挑选了一张牌`,
    surrenderedCards: ss.surrenderedCards,
  })

  // Move to return phase
  ss.phase = 'winners_return'
  sendSurrenderPrompt(io, roomCode, game, room)
}

function processSurrenderReturn(io: WsServer, roomCode: string, playerId: string, card: Card, room: Room, game: NonNullable<Room['game']>) {
  const ss = room.surrenderState!
  if (ss.phase !== 'winners_return') return
  if (ss.winnerIds[ss.currentPairIndex] !== playerId) return
  if (!ss.pendingPick) return

  // Remove ONE returned card from winner's hand (use removeCardFromHand for duplicates)
  const winnerGp = game.players.find(p => p.id === playerId)!
  winnerGp.hand = removeCardFromHand(winnerGp.hand, card)

  const loserId = ss.loserIds[ss.currentPairIndex]
  const loserGp = game.players.find(p => p.id === loserId)!
  loserGp.hand.push(card)

  ss.swaps.push({
    loserId,
    winnerId: playerId,
    gaveUpCard: ss.pendingPick.card,
    receivedCard: card,
  })
  ss.pendingPick = undefined
  log('SURRENDER_RETURN', roomCode, `winner=${playerId} loser=${loserId}`)

  io.to(roomCode).emit('surrender_update', {
    phase: 'winners_return',
    info: `${room.players.find(p => p.id === playerId)?.name || '?'} 返还了一张牌`,
    surrenderedCards: ss.surrenderedCards,
  })

  // Move to next pair or complete
  ss.currentPairIndex++
  if (ss.currentPairIndex < ss.winnerIds.length) {
    ss.phase = 'winners_pick'
    sendSurrenderPrompt(io, roomCode, game, room)
  } else {
    // Complete
    const nextLeadPlayerId = determineNextLead(
      ss.swaps.map(s => ({
        playerId: s.loserId,
        card: s.gaveUpCard,
      }))
    )
    log('SURRENDER_DONE', roomCode, `swaps=${ss.swaps.length} lead=${nextLeadPlayerId}`)
    if (nextLeadPlayerId) {
      const leadIdx = game.players.findIndex(p => p.id === nextLeadPlayerId)
      if (leadIdx >= 0) game.currentPlayerIndex = leadIdx
    }
    room.surrenderState = null
    if ((room as any).__surrenderTimer) {
      clearTimeout((room as any).__surrenderTimer)
      ;(room as any).__surrenderTimer = null
    }
    if (ss.swaps.length > 0) {
      io.to(roomCode).emit('surrender_swap', {
        losers: ss.swaps.map(s => ({ id: s.loserId, gaveUpCard: s.gaveUpCard, receivedCard: s.receivedCard })),
      })
    }
    // Sync all players' hands after surrender swap
    for (const gp of game.players) {
      const rp = room.players.find(p => p.id === gp.id)
      if (!rp) continue
      io.to(rp.socketId).emit('draw_card', { hand: gp.hand, deckCount: game.deck.length })
    }
    const leadGp = game.players[game.currentPlayerIndex]
    promptTurn(io, roomCode, game, room, leadGp.id)
  }
}

function determineNextLead(surrendered: { playerId: string; card: Card }[]): string {
  if (surrendered.length === 0) return ''
  return surrendered.reduce((a, b) => compareCards(a.card, b.card) > 0 ? a : b).playerId
}

// ── Turn timer (Design §9: 30s auto-pass) ──

let turnTimers = new Map<string, ReturnType<typeof setTimeout>>()

function clearTurnTimer(roomCode: string) {
  const t = turnTimers.get(roomCode)
  if (t) { clearTimeout(t); turnTimers.delete(roomCode) }
}

function startTurnTimer(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room, playerId: string) {
  clearTurnTimer(roomCode)
  const timer = setTimeout(() => {
    turnTimers.delete(roomCode)
    if (game.gameOver || game.boxerState) return
    const currentPlayer = game.players[game.currentPlayerIndex]
    if (!currentPlayer || currentPlayer.id !== playerId) return
    const autoResult = handlePass(game, playerId)
    if (autoResult.success) {
      processPassResult(io, roomCode, game, room, autoResult)
    } else {
      // Must play — auto-play the engine's smallest card. Go through the shared path so the
      // round is settled like a real play (round_result + draw + game over). Handling it
      // inline used to score the pot without clearing tableCards, so the same cards were
      // counted again on the next trick (single deck could exceed 100).
      const smallest = getSmallestCard(currentPlayer.hand)
      if (smallest) applyPlay(io, roomCode, game, room, playerId, [smallest])
    }
  }, turnTimeoutMs())
  turnTimers.set(roomCode, timer)
}

// ── Shared pass result processing ──

type PassResult = ReturnType<typeof handlePass>

/** Broadcast the round result (with the current table pot), then clear the table. */
function emitRoundResult(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, winnerId: string) {
  const scoreCards = game.tableCards.filter(c => c.rank === Rank.Five || c.rank === Rank.Ten || c.rank === Rank.King)
  io.to(roomCode).emit('round_result', {
    winnerId, scoreCards,
    scores: game.players.map(p => ({ id: p.id, score: p.score })),
    playerHandSizes: game.players.map(p => ({ id: p.id, cardCount: p.hand.length })),
  })
  game.tableCards = []
  game.tablePlays = []
}

/**
 * If the game ended, delay `game_over` (so the round banner is visible) and start the boxer
 * flow. Returns true when the caller should stop processing the current turn.
 */
function handleGameOverIfNeeded(io: WsServer, roomCode: string, game: NonNullable<Room['game']>): boolean {
  if (!game.gameOver) return false
  const settlement = settleGame(game)
  const remainingScoreCards = getBoxerScoreCards(game)
  const scoreCheck = verifyScoreTotal(game)
  log('GAME_OVER_SCORE', roomCode, scoreCheck.details)
  clearTurnTimer(roomCode)
  setTimeout(() => {
    io.to(roomCode).emit('game_over', { scores: settlement.scores, remainingScoreCards })
    startBoxerFlow(io, roomCode, game)
  }, 2500)
  return true
}

/** Advance the turn to the next active player and prompt them. */
function advanceTurnAndPrompt(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room, winnerId?: string | null) {
  if (winnerId) {
    const winnerIdx = game.players.findIndex(p => p.id === winnerId)
    if (winnerIdx >= 0) game.currentPlayerIndex = winnerIdx
  } else {
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
  }
  for (let i = 0; i < game.players.length && game.players[game.currentPlayerIndex].finished; i++) {
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
  }
  const nextGp = game.players[game.currentPlayerIndex]
  promptTurn(io, roomCode, game, room, nextGp.id)
}

function botDelayMs(): number {
  return Number(process.env.BOT_DELAY_MS) || 700
}

/** How long a human has to act before auto-pass / auto-play keeps the game moving. */
function turnTimeoutMs(): number {
  return Number(process.env.TURN_TIMEOUT_MS) || 30000
}

function flowDelayMs(): number {
  return Number(process.env.FLOW_DELAY_MS) || 2000
}

/** Pause after a boxer reveal/winner so players can read it before the next round. */
function boxerDelayMs(): number {
  return Number(process.env.BOXER_DELAY_MS) || 3000
}

/** Route a turn to a human (your_turn) or an AI (scheduled bot action). */
function promptTurn(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room, playerId: string, extra: Record<string, unknown> = {}) {
  const rp = room.players.find(p => p.id === playerId)
  if (!rp) return
  // AI, or a human who is offline (auto-managed / 托管): act promptly instead of waiting out
  // the whole turn timer, so an absent player never drags the game and it keeps pace.
  if (rp.isAI || !rp.connected) {
    clearTurnTimer(roomCode)
    scheduleBotTurn(io, roomCode, game, room, playerId)
    return
  }
  const gp = game.players.find(p => p.id === playerId)!
  startTurnTimer(io, roomCode, game, room, playerId)
  io.to(rp.socketId).emit('your_turn', { timeout: Math.round(turnTimeoutMs() / 1000), hand: gp.hand, deckCount: game.deck.length, ...extra })
}

function scheduleBotTurn(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room, playerId: string) {
  setTimeout(() => {
    if (game.gameOver || game.boxerState) return
    if (game.players[game.currentPlayerIndex]?.id !== playerId) return
    const gp = game.players.find(p => p.id === playerId)
    if (!gp) return
    const cards = choosePlay({ hand: gp.hand, currentBestPlay: game.currentBestPlay })
    const result = cards
      ? applyPlay(io, roomCode, game, room, playerId, cards)
      : applyPass(io, roomCode, game, room, playerId)
    if (!result.success) applyPass(io, roomCode, game, room, playerId)
  }, botDelayMs())
}

/** Handle a play for a human OR an AI. Returns the handler result; caller reports errors. */
function applyPlay(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room, playerId: string, cards: Card[]) {
  const result = handlePlay(game, playerId, cards)
  if (!result.success) return result
  clearTurnTimer(roomCode)
  let nextPlayerId = ''
  if (result.roundWinner) {
    const wi = game.players.findIndex(p => p.id === result.roundWinner)
    if (wi >= 0) nextPlayerId = game.players[wi].id
  } else {
    let ni = (game.currentPlayerIndex + 1) % game.players.length
    for (let i = 0; i < game.players.length && game.players[ni].finished; i++)
      ni = (ni + 1) % game.players.length
    nextPlayerId = game.players[ni].id
  }
  const playType = identify(cards)
  io.to(roomCode).emit('play_made', {
    playerId,
    nextPlayerId,
    play: { type: playType?.type || 'single', cards },
    tableCards: game.tableCards,
  })
  if (result.roundWinner) {
    emitRoundResult(io, roomCode, game, result.roundWinner)
    if (handleGameOverIfNeeded(io, roomCode, game)) return result
    emitDrawCards(io, roomCode, game, room)
  }
  if (!game.gameOver) advanceTurnAndPrompt(io, roomCode, game, room, result.roundWinner)
  return result
}

/** Handle a pass for a human OR an AI. */
function applyPass(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room, playerId: string) {
  const result = handlePass(game, playerId)
  if (!result.success) return result
  clearTurnTimer(roomCode)
  processPassResult(io, roomCode, game, room, result)
  return result
}

function processPassResult(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room, result: PassResult) {
  if (!result.success) return

  // Broadcast pass_made to clear isMyTurn for the passing player
  const currentPlayer = game.players[game.currentPlayerIndex]
  // Pre-compute next player for UI update
  let passNextId = ''
  if (result.forcePlay && game.bestPlayerId) {
    passNextId = game.bestPlayerId
  } else if (result.roundWinner) {
    passNextId = result.roundWinner
  } else {
    let ni = (game.currentPlayerIndex + 1) % game.players.length
    for (let i = 0; i < game.players.length && game.players[ni]?.finished; i++)
      ni = (ni + 1) % game.players.length
    passNextId = game.players[ni]?.id || ''
  }
  if (currentPlayer) io.to(roomCode).emit('pass_made', { playerId: currentPlayer.id, nextPlayerId: passNextId })

  if (result.forcePlay) {
    const bestIdx = game.players.findIndex(p => p.id === game.bestPlayerId)
    if (bestIdx >= 0) {
      // Score current table cards before clearing (prevents score card loss)
      const bestPlayer = game.players[bestIdx]
      bestPlayer.score += calculateScore(game.tableCards)
      game.currentPlayerIndex = bestIdx
      // Emit round_result so banner shows winner before forced continuation
      emitRoundResult(io, roomCode, game, game.bestPlayerId!)
      const gp = game.players[bestIdx]
      promptTurn(io, roomCode, game, room, gp.id, { tableCards: game.tableCards })
    }
    return
  }

  if (result.roundOver && result.roundWinner) {
    emitRoundResult(io, roomCode, game, result.roundWinner)
    if (handleGameOverIfNeeded(io, roomCode, game)) return
    // Round over, game continues — emit draw cards (Issue #1)
    emitDrawCards(io, roomCode, game, room)
  }

  if (!game.gameOver) {
    advanceTurnAndPrompt(io, roomCode, game, room, result.roundWinner)
  }
}

/**
 * A player left (kicked after disconnect). Drop them from the in-progress game and keep it
 * moving instead of stalling: repair the turn / trick and advance the boxer if needed.
 */
function handlePlayerLeave(io: WsServer, roomCode: string, room: Room, playerId: string) {
  const game = room.game
  if (!game) return
  const { needsResume } = removeGamePlayer(game, playerId)

  if (game.players.length === 0) { room.game = null; return }
  if (game.boxerState) { maybeResolveBoxer(io, roomCode, game); return }
  if (game.gameOver) return
  // A surrender in progress will hand out the first turn itself once it completes.
  if (!needsResume || room.surrenderState) return

  const gp = game.players[game.currentPlayerIndex]
  clearTurnTimer(roomCode)
  promptTurn(io, roomCode, game, room, gp.id, { tableCards: game.tableCards })
}

/** Quick chat (常用语 / free text): max characters per message, per-player cooldown. */
const CHAT_MAX_CHARS = 30
const CHAT_COOLDOWN_MS = 3000
/** Last time each player chatted, for the cooldown. Cleared when they leave the room. */
const chatCooldowns = new Map<string, number>()

function disconnectKickMs(): number {
  return Number(process.env.DISCONNECT_KICK_MS) || 180000
}

/**
 * Remove a seat after the player has been gone past the grace period. While a game is in
 * progress the seat is kept (option B): the turn timer auto-plays for the absent player and
 * they can reconnect to take back control. A finished game (finishBoxerFlow) re-arms this.
 */
function scheduleDisconnectRemoval(io: WsServer, roomCode: string, playerId: string, delayMs: number) {
  setTimeout(() => {
    const player = getPlayer(playerId)
    if (!player || player.connected) return
    const room = getRoom(roomCode)
    if (!room) return
    // Option B keeps a seat for the whole game, but only while another human is still there to
    // play with. If every human has dropped, abandon the room — otherwise the game keeps
    // auto-playing (30s/turn) and the room shows as "in progress" long after everyone left.
    const othersOnline = room.players.some(p => !p.isAI && p.id !== playerId && p.connected)
    if (room.game && othersOnline) return
    if (room.game) room.game = null
    leaveCurrentRoom(io, playerId)
  }, delayMs)
}

/**
 * Remove a (being deleted) account from any room it is in, so deleting a user doesn't leave a
 * stale seat / zombie room behind. Called by the account-deletion REST endpoints.
 */
export function removeAccountFromRooms(playerId: string): void {
  const io = getIO()
  if (io) leaveCurrentRoom(io, playerId)
}

/** The room this player currently belongs to, if any. */
function findPlayerRoom(playerId: string): Room | undefined {
  return getAllRooms().find(r => r.players.some(p => p.id === playerId))
}

/**
 * Leave whatever room the player is currently in. One account may only occupy one room:
 * the Player object is shared, so being in two rooms makes its socketId (used to route
 * `your_turn`/`full_state`) point at the wrong table — the visible symptom is a hand that
 * keeps changing because events from another room leak in.
 */
function leaveCurrentRoom(io: WsServer, playerId: string): void {
  const room = findPlayerRoom(playerId)
  if (!room) return
  chatCooldowns.delete(playerId)
  if (room.game) handlePlayerLeave(io, room.code, room, playerId)
  leaveRoom(room.code, playerId)
  const updated = getRoom(room.code)
  if (updated) {
    io.to(room.code).emit('player_left', { playerId, players: serializePlayers(updated.players) })
  }
  broadcastLobby()
}

function startBoxerFlow(io: WsServer, roomCode: string, game: NonNullable<Room['game']>) {
  const scoreCards = getBoxerScoreCards(game)
  log('BOXER_START', roomCode, `cards=${scoreCards.length}`)
  if (scoreCards.length === 0) {
    log('BOXER_SKIP', roomCode, 'no score cards → resolve rankings directly')
    resolveBoxerChampion(io, roomCode, game)
    return
  }

  // Remove collected score cards from players' hands so they're properly contested
  for (const p of game.players) {
    if (!p.finished) {
      p.hand = p.hand.filter(c => !isScoreCard(c))
    }
  }

  const boxerState: BoxerState = {
    scoreCards,
    currentCardIndex: 0,
    currentSurvivors: [],
    currentMoves: new Map(),
    round: 0,
  }
  game.boxerState = boxerState
  startBoxerRound(io, roomCode, game)
}

/**
 * Re-send the current boxer prompt to a just-reconnected player so their overlay reappears
 * (otherwise a client that missed the boxer events can neither see nor act in the round).
 */
function resendBoxerState(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, playerId: string) {
  const bs = game.boxerState
  const room = getRoom(roomCode)
  const rp = room?.players.find(p => p.id === playerId)
  if (!bs || !room || !rp) return
  const gameScores: Record<string, number> = {}
  const boxerWins: Record<string, number> = {}
  for (const p of game.players) gameScores[p.id] = p.score
  for (const r of room.players) boxerWins[r.id] = r.boxerWins
  io.to(rp.socketId).emit('boxer_start', {
    scoreCard: bs.scoreCards.length > 0 ? bs.scoreCards[bs.currentCardIndex] : null,
    participants: [...bs.currentSurvivors],
    gameScores,
    boxerWins,
    spectators: !bs.currentSurvivors.includes(playerId),
    submitted: bs.currentMoves.has(playerId),
  })
}

// ── Reset ready states for new game ──

/** Sync each player's socketId with the live socket registry. */
function syncPlayerSockets(io: WsServer, room: Room) {
  for (const player of room.players) {
    if (player.isAI) continue
    let found = false
    for (const [sid, sock] of io.sockets.sockets) {
      if (sock.data.playerId === player.id) { player.socketId = sid; found = true; break }
    }
    if (!found) console.log(`[SYNC] player ${player.id} (${player.name}) socket NOT FOUND among ${io.sockets.sockets.size} sockets`)
  }
}

/** Start (or restart) a game for a room. Any room member may trigger it. */
function startRoom(io: WsServer, room: Room) {
  log('GAME_START', room.code, `players=${room.players.length} surrender=${!!room.pendingSurrender}`)
  syncPlayerSockets(io, room)
  const isFirstGame = !room.pendingSurrender
  const game = initGame(room.players.map(p => p.id), room.nextLeadPlayerId, isFirstGame)
  room.game = game
  room.gameStartedAt = Date.now()
  delete room.nextLeadPlayerId

  if (room.pendingSurrender) {
    log('SURRENDER_INIT', room.code, `winners=${room.pendingSurrender.winnerIds.join(',')} losers=${room.pendingSurrender.loserIds.join(',')}`)
    const ps = room.pendingSurrender
    delete room.pendingSurrender
    const playerNames: Record<string, string> = {}
    for (const p of room.players) playerNames[p.id] = p.name
    for (const player of room.players) {
      const gp = game.players.find(p => p.id === player.id)!
      io.to(player.socketId).emit('game_started', {
        hand: gp.hand,
        players: game.players.map(p => {
          const rp = room.players.find(r => r.id === p.id)
          return { ...p, hand: [], cardCount: p.hand.length, wins: rp?.wins || 0, boxerWins: rp?.boxerWins || 0, connected: rp?.connected ?? true }
        }),
        leadPlayerId: '',
        playerNames,
        myId: player.id,
        deckCount: game.deck.length,
      })
    }
    setTimeout(() => {
      room.surrenderState = {
        phase: 'losers_give',
        sortedPlayerIds: [],
        winnerIds: ps.winnerIds,
        loserIds: ps.loserIds,
        currentPairIndex: 0,
        surrenderedCards: [],
        swaps: [],
      }
      sendSurrenderPrompt(io, room.code, game, room)
    }, 800)
  } else {
    emitGameStart(io, room.code, game, room, [])
  }
  broadcastLobby()
}

export function setupWebSocket(httpServer: HttpServer) {
  const io = new Server<ClientEvents, ServerEvents>(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    // Tolerate mobile backgrounding: keep the socket alive across brief suspensions.
    pingInterval: 25000,
    pingTimeout: 60000,
  })

  io.use((socket, next) => {
    const token = (socket.handshake.auth as any)?.token
    const payload = token ? verifyToken(token) : null
    if (!payload) return next(new Error('unauthorized'))
    const user = findUserById(payload.uid)
    if (!user) return next(new Error('unauthorized'))
    socket.data.user = { id: user.id, username: user.username, role: user.role }
    next()
  })
  bindOnline(io)

  io.on('connection', (socket) => {
    const me = socket.data.user as { id: string; username: string; role: string }
    let currentPlayerId: string | null = me.id
    let currentRoomCode: string | null = null
    markOnline(me.id, socket.id)
    broadcastLobby()

    socket.on('create_room', () => {
      leaveCurrentRoom(io, me.id)
      const room = createRoom(6)
      room.hostId = me.id
      const player = createPlayerForAccount(me)
      player.isHost = true
      player.socketId = socket.id
      socket.data.playerId = player.id
      joinRoom(room.code, player)
      currentPlayerId = player.id; currentRoomCode = room.code
      socket.join(room.code)
      socket.emit('room_created', { roomCode: room.code })
      broadcastLobby()
    })

    socket.on('join_room', ({ roomCode }) => {
      // One account = one room: drop any previous seat first (unless it's the same room).
      const current = findPlayerRoom(me.id)
      if (current && current.code !== roomCode) leaveCurrentRoom(io, me.id)
      const player = createPlayerForAccount(me)
      const room = joinRoom(roomCode, player)
      if (!room) { socket.emit('error', { message: 'Room not found, full, or game in progress' }); return }
      const rp = room.players.find(p => p.id === me.id)!
      rp.socketId = socket.id
      rp.connected = true
      socket.data.playerId = player.id
      currentPlayerId = player.id; currentRoomCode = roomCode
      socket.join(roomCode)
      io.to(roomCode).emit('player_joined', { players: serializePlayers(room.players) })
      broadcastLobby()
    })

    socket.on('start_game', () => {
      const room = currentRoomCode ? getRoom(currentRoomCode) : undefined
      if (!room) return
      if (!room.players.some(p => p.id === me.id)) { socket.emit('error', { message: '你不在该房间' }); return }
      if (room.game) { socket.emit('error', { message: '对局已开始' }); return }
      if (room.players.length < 2) { socket.emit('error', { message: '至少需要 2 名玩家' }); return }
      startRoom(io, room)
    })

    // ── AI players (host only, waiting phase) ──

    function manageAIRoom(socket: any): Room | null {
      const room = currentRoomCode ? getRoom(currentRoomCode) : undefined
      if (!room) { socket.emit('error', { message: 'Room not found' }); return null }
      const host = room.players.find(p => p.id === currentPlayerId)
      if (!host?.isHost) { socket.emit('error', { message: 'Only the host can manage AI' }); return null }
      if (room.game) { socket.emit('error', { message: 'Game already started' }); return null }
      return room
    }

    socket.on('add_ai', () => {
      const room = manageAIRoom(socket)
      if (!room) return
      if (room.players.length >= room.maxPlayers) { socket.emit('error', { message: 'Room is full' }); return }
      joinRoom(room.code, createAIPlayer(room.code))
      io.to(room.code).emit('players_updated', { players: serializePlayers(room.players) })
    })

    socket.on('fill_ai', () => {
      const room = manageAIRoom(socket)
      if (!room) return
      while (room.players.length < room.maxPlayers) joinRoom(room.code, createAIPlayer(room.code))
      io.to(room.code).emit('players_updated', { players: serializePlayers(room.players) })
    })

    socket.on('remove_ai', ({ playerId }) => {
      const room = manageAIRoom(socket)
      if (!room) return
      const target = room.players.find(p => p.id === playerId)
      if (!target?.isAI) { socket.emit('error', { message: 'Target is not an AI player' }); return }
      leaveRoom(room.code, playerId)
      io.to(room.code).emit('players_updated', { players: serializePlayers(room.players) })
    })

    // ── Surrender events ──

    socket.on('surrender_give', ({ card }) => {
      if (!currentPlayerId || !currentRoomCode) return
      const room = getRoom(currentRoomCode)
      if (!room?.surrenderState) return
      processSurrenderGive(io, currentRoomCode, currentPlayerId, card, room, room.game!)
    })

    socket.on('surrender_pick', ({ card }) => {
      if (!currentPlayerId || !currentRoomCode) return
      const room = getRoom(currentRoomCode)
      if (!room?.surrenderState) return
      processSurrenderPick(io, currentRoomCode, currentPlayerId, card, room, room.game!)
    })

    socket.on('surrender_return', ({ card }) => {
      if (!currentPlayerId || !currentRoomCode) return
      const room = getRoom(currentRoomCode)
      if (!room?.surrenderState) return
      processSurrenderReturn(io, currentRoomCode, currentPlayerId, card, room, room.game!)
    })

    // ── Play ──

    socket.on('play', ({ cards }) => {
      if (!currentPlayerId || !currentRoomCode) return
      const room = getRoom(currentRoomCode)
      if (!room?.game) return
      const game = room.game
      if (game.gameOver || game.boxerState) { socket.emit('error', { message: 'Game is not accepting plays' }); return }
      if (game.players[game.currentPlayerIndex].id !== currentPlayerId) {
        socket.emit('error', { message: 'Not your turn' }); return
      }
      const result = applyPlay(io, currentRoomCode, game, room, currentPlayerId, cards)
      if (!result.success) socket.emit('error', { message: result.error || 'Invalid play' })
    })

    // ── Pass ──

    socket.on('pass', () => {
      if (!currentPlayerId || !currentRoomCode) return
      const room = getRoom(currentRoomCode)
      if (!room?.game) return
      const game = room.game
      if (game.gameOver || game.boxerState) { socket.emit('error', { message: 'Game is not accepting plays' }); return }
      if (game.players[game.currentPlayerIndex].id !== currentPlayerId) {
        socket.emit('error', { message: 'Not your turn' }); return
      }
      const result = applyPass(io, currentRoomCode, game, room, currentPlayerId)
      if (!result.success) socket.emit('error', { message: result.error || 'Invalid pass' })
    })

    // ── Boxer ──

    socket.on('boxer_move', ({ move }) => {
      if (!currentPlayerId || !currentRoomCode) return
      const room = getRoom(currentRoomCode)
      if (!room?.game?.boxerState) { socket.emit('error', { message: 'No active boxer round' }); return }
      const bs = room.game.boxerState
      if (!bs.currentSurvivors.includes(currentPlayerId)) {
        socket.emit('error', { message: 'You have been eliminated' }); return
      }
      if (bs.currentMoves.has(currentPlayerId)) {
        socket.emit('error', { message: 'Move already submitted' }); return
      }
      bs.currentMoves.set(currentPlayerId, move as BoxerMove)
      maybeResolveBoxer(io, currentRoomCode, room.game)
    })

    // ── Explicit leave (disconnect keeps the seat instead — option B) ──

    socket.on('leave_room', () => {
      if (!currentRoomCode || !currentPlayerId) return
      leaveCurrentRoom(io, currentPlayerId)
      currentRoomCode = null
      currentPlayerId = null
    })

    // ── Quick chat (常用语 / free text) — room-scoped, never persisted ──

    socket.on('chat', ({ text }: { text?: unknown } = {}) => {
      if (!currentRoomCode || !currentPlayerId) return
      const rp = getRoom(currentRoomCode)?.players.find(p => p.id === currentPlayerId)
      if (!rp) return
      const msg = String(text ?? '').replace(/\s+/g, ' ').trim()
      if (!msg) return
      if ([...msg].length > CHAT_MAX_CHARS) {
        socket.emit('error', { message: `讲嘢唔好过 ${CHAT_MAX_CHARS} 个字` }); return
      }
      const now = Date.now()
      if (now - (chatCooldowns.get(currentPlayerId) ?? 0) < CHAT_COOLDOWN_MS) {
        socket.emit('error', { message: '讲得太快啦，唞一唞' }); return
      }
      chatCooldowns.set(currentPlayerId, now)
      io.to(currentRoomCode).emit('chat_message', { playerId: currentPlayerId, name: rp.name, text: msg, at: now })
    })

    // ── Disconnect / Reconnect ──

    socket.on('disconnect', () => {
      markOffline(me.id, socket.id)
      broadcastLobby()
      if (currentPlayerId && currentRoomCode) {
        // A page reload / mobile resume can close the OLD socket *after* the new one has already
        // reconnected. Only mark the seat offline when no socket for this account is left —
        // otherwise the stale close flips `connected` back to false while the player is playing.
        if (isOnline(me.id)) return
        setPlayerConnected(currentPlayerId, false)
        const room = getRoom(currentRoomCode)
        io.to(currentRoomCode).emit('player_disconnected', { playerId: currentPlayerId })
        if (room) io.to(currentRoomCode).emit('players_updated', { players: serializePlayers(room.players) })
        scheduleDisconnectRemoval(io, currentRoomCode, currentPlayerId, disconnectKickMs())
        // If it was their turn, hand it to the auto-manager right away instead of burning the
        // whole turn timer (the reverse happens in promptTurn for any later turn).
        const game = room?.game
        if (room && game && !game.boxerState && game.players[game.currentPlayerIndex]?.id === currentPlayerId) {
          promptTurn(io, currentRoomCode, game, room, currentPlayerId)
        }
      }
    })

    socket.on('reconnect', ({ roomCode }) => {
      // If we're somehow still in another room, leave it so events don't leak across tables.
      const current = findPlayerRoom(me.id)
      if (current && current.code !== roomCode) leaveCurrentRoom(io, me.id)

      const room = getRoom(roomCode)
      if (!room) { socket.emit('error', { message: 'Room not found' }); return }

      let player = getPlayer(me.id)
      // The grace timer may have reclaimed our seat while we were away. If the room still
      // exists and isn't playing, take it back — otherwise the player is stuck ("can't
      // connect") even though nothing stops them from rejoining.
      if (!player && !room.game) {
        player = createPlayerForAccount(me)
        if (!joinRoom(roomCode, player)) { socket.emit('error', { message: 'Player not found' }); return }
        io.to(roomCode).emit('player_joined', { players: serializePlayers(room.players) })
        broadcastLobby()
      }
      if (!player) { socket.emit('error', { message: 'Player not found' }); return }

      setPlayerConnected(me.id, true)
      player.connected = true
      socket.data.playerId = me.id
      player.socketId = socket.id
      socket.join(roomCode)
      currentPlayerId = me.id; currentRoomCode = roomCode
      io.to(roomCode).emit('player_reconnected', { playerId: me.id })
      io.to(roomCode).emit('players_updated', { players: serializePlayers(room.players) })
      const gp = room.game?.players.find(p => p.id === me.id)
      if (room.game && gp) {
        socket.emit('full_state', {
          ...room.game,
          myHand: gp.hand,
          myId: me.id,
          roomCode,
          roomPlayerStats: Object.fromEntries(room.players.map(rp => [rp.id, { wins: rp.wins, boxerWins: rp.boxerWins, connected: rp.connected }])),
          playerNames: Object.fromEntries(room.players.map(rp => [rp.id, rp.name])),
        })
        resendBoxerState(io, roomCode, room.game, me.id)
        if (room.surrenderState) sendSurrenderPrompt(io, roomCode, room.game, room, me.id)
      } else {
        // No game in progress (or this seat isn't part of it): the client may still be on the
        // game screen, so send it back to the room view instead of leaving it stuck.
        socket.emit('next_game_lead', { playerId: '' })
      }
    })
  })
  return io
}
