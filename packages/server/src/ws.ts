import type { Server as HttpServer } from 'http'
import { Server } from 'socket.io'
import type { ClientEvents, ServerEvents, BoxerState } from './types'
import { createPlayer, getPlayer, setPlayerReady, setPlayerConnected, resetPlayerReady } from './player'
import { createRoom, getRoom, joinRoom, leaveRoom } from './room'
import { initGame, handlePlay, handlePass, settleGame, getBoxerScoreCards, getBoxerParticipants, executeSurrenderSwap, verifyScoreTotal, removeCardFromHand, getScoreTieGroups } from './game-machine'
import { Rank, calculateScore, isScoreCard, resolveRound, getWinner, BoxerMove, compareCards, identify } from '@79523/engine'
import type { Card } from '@79523/engine'

import type { Room } from './types'

function serializePlayers(players: Room['players']) {
  return players.map(p => ({ id: p.id, name: p.name, ready: p.ready, connected: p.connected, isHost: p.isHost, wins: p.wins, boxerWins: p.boxerWins }))
}

/** Emit draw_card to all non-finished players after a round ends */
function emitDrawCards(io: ReturnType<typeof Server>, roomCode: string, game: NonNullable<Room['game']>, room: Room) {
  for (const gp of game.players) {
    if (!gp.finished) {
      const p = room.players.find(rp => rp.id === gp.id)
      if (p) io.to(p.socketId).emit('draw_card', { hand: gp.hand, deckCount: game.deck.length })
    }
  }
}

// ── Boxer flow ──

function startBoxerRound(io: ReturnType<typeof Server>, roomCode: string, game: NonNullable<Room['game']>) {
  const bs = game.boxerState!
  const card = bs.scoreCards[bs.currentCardIndex]
  bs.currentSurvivors = getBoxerParticipants(game)
  bs.currentMoves.clear()
  bs.round = 0
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
}

function processBoxerRound(io: ReturnType<typeof Server>, roomCode: string, game: NonNullable<Room['game']>) {
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
      startBoxerRound(io, roomCode, game)
    } else {
      resolveBoxerChampion(io, roomCode, game)
    }
  } else {
    const eliminated = bs.currentSurvivors.filter(id => !survivors.includes(id))
    for (const id of eliminated) io.to(roomCode).emit('boxer_eliminated', { playerId: id })
    bs.currentSurvivors = survivors
    bs.currentMoves.clear()
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
    }, 2000)
  }
}

function resolveBoxerChampion(io: ReturnType<typeof Server>, roomCode: string, game: NonNullable<Room['game']>) {
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
    setTimeout(() => startBoxerTiebreakRound(io, roomCode, game), 2000)
    return
  }

  // Step 2: Resolve score-based ranking ties
  resolveScoreRankings(io, roomCode, game)
}

/** Find tied score groups and run ranking tiebreakers to produce unique ordering */
function resolveScoreRankings(io: ReturnType<typeof Server>, roomCode: string, game: NonNullable<Room['game']>, startGroupIdx = 0) {
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
  setTimeout(() => startBoxerTiebreakRound(io, roomCode, game), 2000)
}

function startBoxerTiebreakRound(io: ReturnType<typeof Server>, roomCode: string, game: NonNullable<Room['game']>) {
  const bs = game.boxerState!
  bs.currentMoves.clear()
  bs.round = 0
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
}

/** Resolve tiebreaker round: first player to win becomes champion */
function resolveBoxerTiebreakRound(io: ReturnType<typeof Server>, roomCode: string, game: NonNullable<Room['game']>) {
  const bs = game.boxerState!
  bs.round++

  const survivors = resolveRound(bs.currentMoves)
  const moveMap: Record<string, string> = {}
  for (const [id, move] of bs.currentMoves) moveMap[id] = move
  io.to(roomCode).emit('boxer_reveal', { moves: moveMap })

  if (survivors.length === 1) {
    const championId = getWinner(survivors)
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
      const nextIdx = (bs as any).tieGroupIndex !== undefined ? (bs as any).tieGroupIndex + 1 : 0
      resolveScoreRankings(io, roomCode, game, nextIdx)
    }, 2000)
  } else {
    const eliminated = bs.currentSurvivors.filter(id => !survivors.includes(id))
    for (const id of eliminated) io.to(roomCode).emit('boxer_eliminated', { playerId: id })
    bs.currentSurvivors = survivors
    bs.currentMoves.clear()

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
    }, 2000)
  }
}

function finishBoxerFlow(io: ReturnType<typeof Server>, roomCode: string, game: NonNullable<Room['game']>) {
  const room = getRoom(roomCode)
  if (!room) return
  game.boxerState = null

  const sorted = [...game.players].sort((a, b) => b.score - a.score)
  const pc = game.players.length

  // Save surrender info for after next game's cards are dealt
  room.pendingSurrender = {
    winnerIds: pc < 4 ? [sorted[0].id] : sorted.slice(0, 2).map(p => p.id),
    loserIds: pc < 4 ? [sorted[sorted.length - 1].id] : sorted.slice(-2).map(p => p.id),
  }

  // Timing: boxer end → 2s → settlement → 3s → leaderboard
  setTimeout(() => {
    io.to(roomCode).emit('scores_updated', {
      scores: sorted.map(p => ({ id: p.id, totalScore: p.score })),
    })

    setTimeout(() => {
      io.to(roomCode).emit('next_game_lead', { playerId: '' })
    }, 3000)
  }, 2000)
}

// ── Helper: emit game_started + your_turn ──
function emitGameStart(io: ReturnType<typeof Server>, roomCode: string, game: NonNullable<Room['game']>, room: Room, swaps: any[]) {
  const leadPlayerId = game.players[game.currentPlayerIndex].id
  const playerNames: Record<string, string> = {}
  for (const p of room.players) playerNames[p.id] = p.name
  for (const player of room.players) {
    const gp = game.players.find(p => p.id === player.id)!
    io.to(player.socketId).emit('game_started', {
      hand: gp.hand,
      players: game.players.map(p => ({ ...p, hand: [], cardCount: p.hand.length })),
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
  const leadSocket = room.players.find(p => p.id === leadPlayerId)!
  const leadGp = game.players.find(p => p.id === leadPlayerId)!
  console.log(`[TURN] your_turn to ${leadPlayerId} via socket ${leadSocket.socketId} (emitGameStart)`)
  startTurnTimer(io, roomCode, game, room, leadPlayerId)
  io.to(leadSocket.socketId).emit('your_turn', { timeout: 30, hand: leadGp.hand, deckCount: game.deck.length })
}

// ── Surrender flow (manual) ──

const SURRENDER_TIMEOUT = 15000 // 15s auto-complete if no player responds

// ── Logging ──
const log = (evt: string, roomCode: string, detail?: any) => {
  const ts = new Date().toISOString().slice(11, 19)
  const extra = detail ? ' ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''
  console.log(`[${ts}] [${roomCode}] ${evt}${extra}`)
}

function startSurrenderFlow(io: ReturnType<typeof Server>, roomCode: string, game: NonNullable<Room['game']>, room: Room) {
  const sorted = [...game.players].sort((a, b) => b.score - a.score)
  const playerCount = game.players.length

  if (playerCount < 4) {
    room.surrenderState = {
      phase: 'losers_give',
      sortedPlayerIds: sorted.map(p => p.id),
      winnerIds: [sorted[0].id],
      loserIds: [sorted[sorted.length - 1].id],
      currentPairIndex: 0,
      surrenderedCards: [],
      swaps: [],
    }
  } else {
    room.surrenderState = {
      phase: 'losers_give',
      sortedPlayerIds: sorted.map(p => p.id),
      winnerIds: sorted.slice(0, 2).map(p => p.id),
      loserIds: sorted.slice(-2).map(p => p.id),
      currentPairIndex: 0,
      surrenderedCards: [],
      swaps: [],
    }
  }

  // Start timeout — auto-complete if no manual interaction
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    // Auto-execute: use the game-machine logic directly
    const { swaps, nextLeadPlayerId } = executeSurrenderSwap(game)
    io.to(roomCode).emit('surrender_swap', {
      losers: swaps.map((s: any) => ({ id: s.loserId, gaveUpCard: s.gaveUpCard, receivedCard: s.receivedCard })),
    })
    io.to(roomCode).emit('next_game_lead', { playerId: nextLeadPlayerId })
    room.nextLeadPlayerId = nextLeadPlayerId
    room.surrenderState = null
  }, SURRENDER_TIMEOUT)

  // Store timer reference to clear on manual completion
  ;(room as any).__surrenderTimer = timer

  sendSurrenderPrompt(io, roomCode, game, room)
}

function resetSurrenderTimer(io: ReturnType<typeof Server>, roomCode: string, game: NonNullable<Room['game']>, room: Room) {
  if ((room as any).__surrenderTimer) {
    clearTimeout((room as any).__surrenderTimer)
    ;(room as any).__surrenderTimer = null
  }
  const timer = setTimeout(() => {
    ;(room as any).__surrenderTimer = null
    if (game.gameOver || game.boxerState) return
    const { swaps, nextLeadPlayerId } = executeSurrenderSwap(game)
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
    const leadPlayer = room.players.find(p => p.id === leadGp.id)
    if (leadPlayer) {
      room.surrenderState = null
      startTurnTimer(io, roomCode, game, room, leadGp.id)
      io.to(leadPlayer.socketId).emit('your_turn', { timeout: 30, hand: leadGp.hand, deckCount: game.deck.length })
    }
  }, SURRENDER_TIMEOUT)
  ;(room as any).__surrenderTimer = timer
}

function sendSurrenderPrompt(io: ReturnType<typeof Server>, roomCode: string, game: NonNullable<Room['game']>, room: Room) {
  const ss = room.surrenderState!
  log('SURRENDER_PROMPT', roomCode, `phase=${ss.phase} pair=${ss.currentPairIndex}`)
  resetSurrenderTimer(io, roomCode, game, room)
  const gp = (id: string) => game.players.find(p => p.id === id)!

  if (ss.phase === 'losers_give') {
    const loserId = ss.loserIds[ss.currentPairIndex]
    const loser = room.players.find(p => p.id === loserId)
    if (!loser) return
    io.to(loser.socketId).emit('surrender_start', {
      phase: 'losers_give',
      yourRole: 'loser',
      hand: gp(loserId).hand,
      info: `请选择你手中最大的单张牌上缴`,
    })
    // Other players see waiting state
    for (const p of room.players) {
      if (p.id !== loserId) {
        const playerGp = gp(p.id)
        const role = ss.winnerIds.includes(p.id) ? 'winner' : 'spectator'
        io.to(p.socketId).emit('surrender_start', {
          phase: 'losers_give',
          yourRole: role as 'winner' | 'spectator',
          hand: playerGp.hand,
          info: `等待 ${loser.name} 上缴最大牌...`,
        })
      }
    }
  } else if (ss.phase === 'winners_pick') {
    const winnerId = ss.winnerIds[ss.currentPairIndex]
    const winner = room.players.find(p => p.id === winnerId)
    if (!winner) return

    const surrenderedInfos = ss.surrenderedCards.map(sc => {
      const lp = room.players.find(rp => rp.id === sc.playerId)
      return { playerId: sc.playerId, playerName: lp?.name || '?', card: sc.card }
    })

    io.to(winner.socketId).emit('surrender_start', {
      phase: 'winners_pick',
      yourRole: 'winner',
      hand: gp(winnerId).hand,
      info: `请从对手上缴的牌中挑选一张`,
      surrenderedCards: surrenderedInfos,
    })
    for (const p of room.players) {
      if (p.id !== winnerId) {
        io.to(p.socketId).emit('surrender_start', {
          phase: 'winners_pick',
          yourRole: 'spectator',
          hand: gp(p.id).hand,
          info: `等待 ${winner.name} 挑选牌...`,
        })
      }
    }
  } else if (ss.phase === 'winners_return') {
    const winnerId = ss.winnerIds[ss.currentPairIndex]
    const winner = room.players.find(p => p.id === winnerId)
    if (!winner || !ss.pendingPick) return

    io.to(winner.socketId).emit('surrender_start', {
      phase: 'winners_return',
      yourRole: 'winner',
      hand: gp(winnerId).hand,
      info: `请选择一张牌还给对手`,
    })
    for (const p of room.players) {
      if (p.id !== winnerId) {
        io.to(p.socketId).emit('surrender_start', {
          phase: 'winners_return',
          yourRole: 'spectator',
          hand: gp(p.id).hand,
          info: `等待 ${winner.name} 返还牌...`,
        })
      }
    }
  }
}

function processSurrenderGive(io: ReturnType<typeof Server>, roomCode: string, playerId: string, card: Card, room: Room, game: NonNullable<Room['game']>) {
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

function processSurrenderPick(io: ReturnType<typeof Server>, roomCode: string, playerId: string, card: Card, room: Room, game: NonNullable<Room['game']>) {
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

function processSurrenderReturn(io: ReturnType<typeof Server>, roomCode: string, playerId: string, card: Card, room: Room, game: NonNullable<Room['game']>) {
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
    const leadSocket = room.players[game.currentPlayerIndex]
    startTurnTimer(io, roomCode, game, room, leadGp.id)
    io.to(leadSocket.socketId).emit('your_turn', { timeout: 30, hand: leadGp.hand, deckCount: game.deck.length })
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

function startTurnTimer(io: ReturnType<typeof Server>, roomCode: string, game: NonNullable<Room['game']>, room: Room, playerId: string) {
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
      // Must play — auto-play smallest single card
      const hand = currentPlayer.hand
      if (hand.length > 0) {
        const smallest = hand.reduce((a, b) => a.rank < b.rank ? a : b)
        const playResult = handlePlay(game, playerId, [smallest])
        if (playResult.success) {
          io.to(roomCode).emit('play_made', {
            playerId,
            nextPlayerId: '',
            play: { type: 'single', cards: [smallest] },
            tableCards: game.tableCards,
          })
          // Advance turn
          if (playResult.roundWinner) {
            const wi = game.players.findIndex(p => p.id === playResult.roundWinner)
            if (wi >= 0) game.currentPlayerIndex = wi
          } else {
            game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
          }
          for (let i = 0; i < game.players.length && game.players[game.currentPlayerIndex]?.finished; i++)
            game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
          const nextGp = game.players[game.currentPlayerIndex]
          const rp2 = room.players.find(p => p.id === nextGp.id)
          if (!rp2) { room.surrenderState = null; return }
          startTurnTimer(io, roomCode, game, room, nextGp.id)
          io.to(rp2.socketId).emit('your_turn', { timeout: 30, hand: nextGp.hand, deckCount: game.deck.length })
        }
      }
    }
  }, 30000)
  turnTimers.set(roomCode, timer)
}

// ── Shared pass result processing ──

type PassResult = ReturnType<typeof handlePass>

function processPassResult(io: ReturnType<typeof Server>, roomCode: string, game: NonNullable<Room['game']>, room: Room, result: PassResult) {
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
      game.tableCards = []
      const gp = game.players[bestIdx]
      startTurnTimer(io, roomCode, game, room, gp.id)
      io.to(room.players[bestIdx].socketId).emit('your_turn', { timeout: 30, hand: gp.hand, deckCount: game.deck.length, tableCards: game.tableCards })
    }
    return
  }

  if (result.roundOver && result.roundWinner) {
    const passScoreCards = game.tableCards.filter(c => c.rank === Rank.Five || c.rank === Rank.Ten || c.rank === Rank.King)
    io.to(roomCode).emit('round_result', {
      winnerId: result.roundWinner, scoreCards: passScoreCards,
      scores: game.players.map(p => ({ id: p.id, score: p.score })),
      playerHandSizes: game.players.map(p => ({ id: p.id, cardCount: p.hand.length })),
    })
    game.tableCards = []
    if (result.gameOver) {
      // Track wins for top players
      const settlement = settleGame(game)
      const topPlayers = settlement.topTwo
      if (topPlayers.length > 0) {
        const winner = room.players.find(p => p.id === topPlayers[0])
        if (winner) winner.wins++
      }
      const remainingScoreCards = getBoxerScoreCards(game)
      const scoreCheck = verifyScoreTotal(game)
      log('GAME_OVER_SCORE', roomCode, scoreCheck.details)
      io.to(roomCode).emit('game_over', { scores: settlement.scores, remainingScoreCards })
      clearTurnTimer(roomCode)
      startBoxerFlow(io, roomCode, game)
      return
    }
    // Round over, game continues — emit draw cards (Issue #1)
    emitDrawCards(io, roomCode, game, room)
  }

  if (!game.gameOver) {
    if (result.roundWinner) {
      const winnerIdx = game.players.findIndex(p => p.id === result.roundWinner)
      if (winnerIdx >= 0) game.currentPlayerIndex = winnerIdx
    } else {
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
    }
    for (let i = 0; i < game.players.length && game.players[game.currentPlayerIndex].finished; i++) {
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
    }
    const nextGp = game.players[game.currentPlayerIndex]
    const rp = room.players.find(p => p.id === nextGp.id)
    if (!rp) { room.surrenderState = null; return }
    startTurnTimer(io, roomCode, game, room, nextGp.id)
    io.to(rp.socketId).emit('your_turn', { timeout: 30, hand: nextGp.hand, deckCount: game.deck.length })
  }
}

function startBoxerFlow(io: ReturnType<typeof Server>, roomCode: string, game: NonNullable<Room['game']>) {
  const scoreCards = getBoxerScoreCards(game)
  log('BOXER_START', roomCode, `cards=${scoreCards.length}`)
  if (scoreCards.length === 0) {
    log('BOXER_SKIP', roomCode, 'no score cards')
    finishBoxerFlow(io, roomCode, game)
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

// ── Reset ready states for new game ──

function resetRoomForNewGame(room: Room) {
  for (const p of room.players) resetPlayerReady(p.id)
  room.game = null
  room.surrenderState = null
  if ((room as any).__surrenderTimer) {
    clearTimeout((room as any).__surrenderTimer)
    ;(room as any).__surrenderTimer = null
  }
}

export function setupWebSocket(httpServer: HttpServer) {
  const io = new Server<ClientEvents, ServerEvents>(httpServer, { cors: { origin: '*', methods: ['GET', 'POST'] } })

  io.on('connection', (socket) => {
    let currentPlayerId: string | null = null
    let currentRoomCode: string | null = null

    // Helper: sync player socketId before sending individual events
    function syncPlayerSockets(room: Room) {
      for (const player of room.players) {
        let found = false
        for (const [sid, sock] of io.sockets.sockets) {
          if (sock.data.playerId === player.id) {
            player.socketId = sid
            found = true
            break
          }
        }
        if (!found) console.log(`[SYNC] player ${player.id} (${player.name}) socket NOT FOUND among ${io.sockets.sockets.size} sockets`)
      }
    }

    socket.on('create_room', ({ name, maxPlayers }) => {
      const room = createRoom(maxPlayers)
      const player = createPlayer(socket.id, name, true)  // Creator is host
      socket.data.playerId = player.id
      joinRoom(room.code, player)
      currentPlayerId = player.id; currentRoomCode = room.code
      socket.join(room.code)
      socket.emit('room_created', { roomCode: room.code })
    })

    socket.on('join_room', ({ roomCode, playerName }) => {
      const player = createPlayer(socket.id, playerName)
      const room = joinRoom(roomCode, player)
      if (!room) { socket.emit('error', { message: 'Room not found or full' }); return }
      socket.data.playerId = player.id
      currentPlayerId = player.id; currentRoomCode = roomCode
      socket.join(roomCode)
      io.to(roomCode).emit('player_joined', { players: serializePlayers(room.players) })
    })

    socket.on('ready', () => {
      if (!currentPlayerId || !currentRoomCode) return
      setPlayerReady(currentPlayerId, true)
      const room = getRoom(currentRoomCode)
      if (!room) return
      io.to(currentRoomCode).emit('players_updated', { players: serializePlayers(room.players) })
      if (room.players.every(p => p.ready) && room.players.length >= 2) {
        log('GAME_START', currentRoomCode, `players=${room.players.length} surrender=${!!room.pendingSurrender}`)
        syncPlayerSockets(room)
        const game = initGame(room.players.map(p => p.id), room.nextLeadPlayerId)
        room.game = game
        delete room.nextLeadPlayerId

        if (room.pendingSurrender) {
          log('SURRENDER_INIT', currentRoomCode, `winners=${room.pendingSurrender.winnerIds.join(',')} losers=${room.pendingSurrender.loserIds.join(',')}`)
          // Emit game_started first so clients navigate to game page and mount SurrenderOverlay
          const ps = room.pendingSurrender
          delete room.pendingSurrender

          // Temporarily announce game_started so clients can navigate
          const playerNames: Record<string, string> = {}
          for (const p of room.players) playerNames[p.id] = p.name
          for (const player of room.players) {
            const gp = game.players.find(p => p.id === player.id)!
            io.to(player.socketId).emit('game_started', {
              hand: gp.hand,
              players: game.players.map(p => ({ ...p, hand: [], cardCount: p.hand.length })),
              leadPlayerId: '',
              playerNames,
              myId: player.id,
              deckCount: game.deck.length,
            })
          }
          // Give clients time to mount, then start surrender
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
            sendSurrenderPrompt(io, currentRoomCode, game, room)
            // Timer managed by resetSurrenderTimer in sendSurrenderPrompt
          }, 800)
        } else {
          // Normal start — no pending surrender (first game)
          emitGameStart(io, currentRoomCode, game, room, [])
        }
      }
    })

    // ── New game (host only) ──

    socket.on('start_new_game', () => {
      if (!currentPlayerId || !currentRoomCode) return
      const room = getRoom(currentRoomCode)
      if (!room) return
      const host = room.players.find(p => p.id === currentPlayerId)
      if (!host?.isHost) { socket.emit('error', { message: 'Only the room host can start a new game' }); return }
      resetRoomForNewGame(room)
      io.to(currentRoomCode).emit('players_updated', { players: serializePlayers(room.players) })
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
      if (game.players[game.currentPlayerIndex].id !== currentPlayerId) {
        socket.emit('error', { message: 'Not your turn' }); return
      }
      clearTurnTimer(currentRoomCode)
      const result = handlePlay(game, currentPlayerId, cards)
      if (!result.success) { socket.emit('error', { message: result.error || 'Invalid play' }); return }
      // Determine next player for UI update
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
      io.to(currentRoomCode).emit('play_made', {
        playerId: currentPlayerId,
        nextPlayerId,
        play: { type: playType?.type || 'single', cards },
        tableCards: game.tableCards,
      })
      if (result.roundWinner) {
        const scoreCards = game.tableCards.filter(c => {
          return c.rank === Rank.Five || c.rank === Rank.Ten || c.rank === Rank.King
        })
        io.to(currentRoomCode).emit('round_result', {
          winnerId: result.roundWinner, scoreCards,
          scores: game.players.map(p => ({ id: p.id, score: p.score })),
          playerHandSizes: game.players.map(p => ({ id: p.id, cardCount: p.hand.length })),
        })
        game.tableCards = []
        if (result.gameOver) {
          const settlement = settleGame(game)
          const topPlayers = settlement.topTwo
          if (topPlayers.length > 0) {
            const winner = room.players.find(p => p.id === topPlayers[0])
            if (winner) winner.wins++
          }
          const remainingScoreCards = getBoxerScoreCards(game)
          const scoreCheck2 = verifyScoreTotal(game)
          log('GAME_OVER_SCORE', currentRoomCode, scoreCheck2.details)
          io.to(currentRoomCode).emit('game_over', { scores: settlement.scores, remainingScoreCards })
          clearTurnTimer(currentRoomCode)
          startBoxerFlow(io, currentRoomCode, game)
          return
        }
        // Round over, game continues — emit draw cards immediately (Issue #1)
        emitDrawCards(io, currentRoomCode, game, room)
      }
      if (!game.gameOver) {
        if (result.roundWinner) {
          const winnerIdx = game.players.findIndex(p => p.id === result.roundWinner)
          if (winnerIdx >= 0) game.currentPlayerIndex = winnerIdx
        } else {
          game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
        }
        for (let i = 0; i < game.players.length && game.players[game.currentPlayerIndex].finished; i++) {
          game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
        }
        const nextGp = game.players[game.currentPlayerIndex]
        const rp3 = room.players.find(p => p.id === nextGp.id)
        if (!rp3) { room.surrenderState = null; return }
        startTurnTimer(io, currentRoomCode, game, room, nextGp.id)
        io.to(rp3.socketId).emit('your_turn', { timeout: 30, hand: nextGp.hand, deckCount: game.deck.length })
      }
    })

    // ── Pass ──

    socket.on('pass', () => {
      if (!currentPlayerId || !currentRoomCode) return
      const room = getRoom(currentRoomCode)
      if (!room?.game) return
      const game = room.game
      if (game.players[game.currentPlayerIndex].id !== currentPlayerId) {
        socket.emit('error', { message: 'Not your turn' }); return
      }
      clearTurnTimer(currentRoomCode)
      const passResult = handlePass(game, currentPlayerId)
      if (!passResult.success) { socket.emit('error', { message: passResult.error || 'Invalid pass' }); return }
      processPassResult(io, currentRoomCode, game, room, passResult)
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
      if (bs.currentMoves.size >= bs.currentSurvivors.length) {
        if (bs.scoreCards.length === 0) {
          resolveBoxerTiebreakRound(io, currentRoomCode, room.game)
        } else {
          processBoxerRound(io, currentRoomCode, room.game)
        }
      }
    })

    // ── Disconnect / Reconnect ──

    socket.on('disconnect', () => {
      if (currentPlayerId && currentRoomCode) {
        setPlayerConnected(currentPlayerId, false)
        io.to(currentRoomCode).emit('player_disconnected', { playerId: currentPlayerId })
        setTimeout(() => {
          const player = getPlayer(currentPlayerId!)
          if (player && !player.connected) {
            leaveRoom(currentRoomCode!, currentPlayerId!)
            const updated = getRoom(currentRoomCode!)
            io.to(currentRoomCode!).emit('player_left', {
              playerId: currentPlayerId!,
              players: updated ? serializePlayers(updated.players) : [],
            })
          }
        }, 30000)
      }
    })

    socket.on('reconnect', ({ roomCode, playerId }) => {
      const player = getPlayer(playerId)
      if (!player) { socket.emit('error', { message: 'Player not found' }); return }
      setPlayerConnected(playerId, true)
      socket.data.playerId = playerId  // Re-establish identity for syncPlayerSockets
      player.socketId = socket.id
      socket.join(roomCode)
      currentPlayerId = playerId; currentRoomCode = roomCode
      io.to(roomCode).emit('player_reconnected', { playerId })
      const room = getRoom(roomCode)
      if (room?.game) {
        const gp = room.game.players.find(p => p.id === playerId)!
        socket.emit('full_state', { ...room.game, myHand: gp.hand, myId: playerId })
      }
    })
  })
  return io
}
