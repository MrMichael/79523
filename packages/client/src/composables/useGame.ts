import { ref } from 'vue'
import { useSocket } from './useSocket'
import { useGameStore } from '@/stores/game'
import type { Card } from '@79523/engine'

let listenersSetup = false
let countdownTimer: ReturnType<typeof setInterval> | null = null

const clog = (evt: string, detail?: any) => {
  const extra = detail ? ' ' + (typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 120)) : ''
  console.log(`[GAME] ${evt}${extra}`)
}

function startCountdown(store: ReturnType<typeof useGameStore>) {
  stopCountdown()
  countdownTimer = setInterval(() => {
    if (!store.isMyTurn || store.timeLeft <= 0) {
      stopCountdown()
      return
    }
    store.timeLeft--
  }, 1000)
}

function stopCountdown() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
}

// Module-level shared state — survives route changes, shared across all useGame() calls
const players = ref<{ id: string; name: string; cardCount: number; score: number; wins: number; boxerWins: number }[]>([])
const playerNames = ref<Record<string, string>>({})

/** Reset shared game state + listener guard when leaving the game (e.g. returning home).
 *  Without this, a fresh socket after reconnect would never get the game event handlers re-registered. */
export function resetGame() {
  listenersSetup = false
  stopCountdown()
  players.value = []
  playerNames.value = {}
  useGameStore().reset()
}

export function useGame() {
  const { socket } = useSocket()
  const store = useGameStore()

  function play(cards: Card[]) { socket.value?.emit('play', { cards }) }
  function pass() { socket.value?.emit('pass') }
  function boxerMove(move: string) { socket.value?.emit('boxer_move', { move }) }

  function setupListeners() {
    if (listenersSetup) return
    listenersSetup = true
    socket.value?.on('game_started', ({ hand, players: gamePlayers, leadPlayerId, playerNames: names, myId, deckCount }: any) => {
      clog('game_started', { myId, hand: hand?.length, deck: deckCount, lead: leadPlayerId })
      store.myId = myId
      store.myHand = hand ?? []
      store.currentPlayerId = leadPlayerId
      store.tableCards = []
      store.tablePlays = []
      store.deckCount = deckCount ?? 104
      store.gameOver = false
      store.finalRankings = []
      store.roundWinnerId = ''
      store.roundScoreCards = []
      store.bumpTrick()
      playerNames.value = names
      const initScores: Record<string, number> = {}
      for (const p of gamePlayers) initScores[p.id] = p.score
      store.scores = initScores
      players.value = gamePlayers.map((p: any) => ({
        id: p.id,
        name: names[p.id] || '?',
        cardCount: p.cardCount ?? p.hand?.length ?? 0,
        score: p.score,
        wins: p.wins || 0,
        boxerWins: p.boxerWins || 0,
      }))
    })

    socket.value?.on('your_turn', ({ timeout, hand, deckCount, tableCards }: any) => {
      clog('your_turn', { hand: hand?.length, deck: deckCount })
      store.clearSelection()
      store.isMyTurn = true
      store.timeLeft = timeout ?? 30
      store.currentPlayerId = store.myId
      if (hand) store.myHand = hand
      if (deckCount !== undefined) store.deckCount = deckCount
      if (tableCards !== undefined) store.tableCards = tableCards
      startCountdown(store)
    })

    socket.value?.on('play_made', ({ playerId, nextPlayerId, tableCards, play }: any) => {
      store.tableCards = tableCards
      store.tablePlays.push({ playerId, cards: play?.cards || [] })
      store.isMyTurn = false
      store.lastPlayType = play?.type || ''
      store.lastPlayedCards = play?.cards || []
      store.lastPlayPlayer = playerNames.value[playerId] || playerId?.slice(0, 4) || ''
      stopCountdown()
      if (nextPlayerId) store.currentPlayerId = nextPlayerId
      if (playerId === store.myId) {
        store.removeFromHand(play?.cards || [])
      }
      const p = players.value.find(p => p.id === playerId)
      if (p) p.cardCount = Math.max(0, p.cardCount - (play?.cards?.length || 0))
    })

    socket.value?.on('pass_made', ({ playerId, nextPlayerId }: any) => {
      store.clearSelection()
      store.isMyTurn = false
      store.lastPassPlayer = playerNames.value[playerId] || playerId?.slice(0, 4) || ''
      stopCountdown()
      if (nextPlayerId) store.currentPlayerId = nextPlayerId
    })

    socket.value?.on('draw_card', ({ hand, deckCount }: any) => {
      store.clearSelection()
      if (hand) store.myHand = hand
      if (deckCount !== undefined) store.deckCount = deckCount
    })

    socket.value?.on('round_result', ({ winnerId, scoreCards, scores: newScores, playerHandSizes }: any) => {
      store.clearSelection()
      const updatedScores: Record<string, number> = { ...store.scores }
      for (const s of newScores) updatedScores[s.id] = s.score
      store.scores = updatedScores
      store.isMyTurn = false
      store.tableCards = []
      store.tablePlays = []
      store.bumpTrick()
      store.roundWinnerId = winnerId || ''
      store.roundScoreCards = scoreCards || []
      // Update player scores and hand sizes in the players list
      for (const p of players.value) {
        const s = newScores.find((ns: any) => ns.id === p.id)
        if (s) p.score = s.score
        const hs = playerHandSizes?.find((h: any) => h.id === p.id)
        if (hs) p.cardCount = hs.cardCount
      }
    })

    socket.value?.on('game_over', ({ scores: finalScores }: any) => {
      clog('game_over', finalScores?.map((s:any) => `${s.id}=${s.totalScore}`))
      const finalScoresRecord: Record<string, number> = {}
      for (const s of finalScores) finalScoresRecord[s.id] = s.totalScore ?? s.score ?? 0
      store.scores = finalScoresRecord
      store.isMyTurn = false
      store.gameOver = true
      store.finalRankings = finalScores
    })

    // ── Boxer events ──

    socket.value?.on('boxer_start', ({ scoreCard, participants, gameScores, boxerWins, submitted }: any) => {
      clog('boxer_start', { participants: participants?.length })
      store.boxerPhase = 'awaiting'
      store.boxerScoreCard = scoreCard
      store.boxerParticipants = participants
      store.boxerMoves = {}
      store.boxerSurvivors = [...participants]
      store.boxerCountdown = 3
      store.boxerSubmitted = !!submitted
      if (gameScores) store.boxerGameScores = gameScores
      if (boxerWins) store.boxerWinCounts = boxerWins
    })

    socket.value?.on('boxer_reveal', ({ moves }: any) => {
      store.boxerMoves = moves
      store.boxerPhase = 'reveal'
    })

    socket.value?.on('boxer_eliminated', ({ playerId }: any) => {
      store.boxerSurvivors = store.boxerSurvivors.filter(id => id !== playerId)
      if (playerId === store.myId) store.boxerPhase = 'eliminated'
    })

    socket.value?.on('boxer_winner', ({ playerId, scoreCard, points, scores }: any) => {
      store.boxerWinnerId = playerId
      store.boxerScoreCard = scoreCard
      store.boxerWinPoints = points ?? 0
      if (scores) {
        const updated: Record<string, number> = {}
        for (const s of scores) updated[s.id] = s.score
        store.boxerGameScores = updated
      }
    })

    socket.value?.on('surrender_start', (data: any) => {
      clog('surrender_start', { phase: data.phase, role: data.yourRole, hand: data.hand?.length })
      if (data.hand) store.myHand = data.hand
      store.surrenderActive = true
      store.surrenderPhase = data.phase
      store.surrenderRole = data.yourRole
      store.surrenderHand = data.hand || []
      store.surrenderInfo = data.info || ''
      if (data.surrenderedCards) store.surrenderPickCards = data.surrenderedCards
    })

    socket.value?.on('surrender_update', (data: any) => {
      clog('surrender_update', { phase: data.phase, info: data.info })
      if (data.info) store.surrenderInfo = data.info
      if (data.surrenderedCards !== undefined) store.surrenderPickCards = data.surrenderedCards
    })

    socket.value?.on('surrender_swap', ({ losers }: any) => {
      clog('surrender_swap', losers?.map((l: any) => l.id))
      // Inter-game surrender completed — hide the overlay after players can read the summary.
      setTimeout(() => {
        store.surrenderActive = false
        store.surrenderPhase = ''
        store.surrenderRole = 'spectator'
        store.surrenderHand = []
        store.surrenderInfo = ''
        store.surrenderPickCards = []
      }, 1500)
    })

    socket.value?.on('boxer_champion', ({ playerId, scores }: any) => {
      clog('boxer_champion', playerId)
      store.boxerWinnerId = playerId
      if (scores) {
        const updated: Record<string, number> = {}
        for (const s of scores) updated[s.id] = s.score
        store.boxerGameScores = updated
      }
    })

    socket.value?.on('boxer_tiebreak', ({ participants, info }: any) => {
      clog('boxer_tiebreak', info)
    })

    socket.value?.on('scores_updated', ({ scores }: any) => {
      const updated: Record<string, number> = {}
      for (const s of scores) updated[s.id] = s.totalScore ?? s.score ?? 0
      store.scores = updated
      store.finalRankings = scores
    })

    socket.value?.on('room_stats_updated', ({ stats }: any) => {
      if (!stats) return
      for (const s of stats) {
        const p = players.value.find(pl => pl.id === s.id)
        if (p) { p.wins = s.wins; p.boxerWins = s.boxerWins }
      }
    })

    socket.value?.on('next_game_lead', () => {
      clog('next_game_lead')
      store.boxerPhase = 'idle'
      store.boxerScoreCard = null
      store.boxerParticipants = []
      store.boxerMoves = {}
      store.boxerSurvivors = []
      store.boxerWinnerId = ''
      store.boxerSubmitted = false
      store.surrenderActive = false
      store.surrenderPhase = ''
      store.surrenderRole = 'spectator'
      store.surrenderHand = []
      store.surrenderInfo = ''
      store.surrenderPickCards = []
    })

    socket.value?.on('full_state', ({ myHand: hand, deck, tableCards, tablePlays, players: gamePlayers, currentPlayerIndex, myId, roomPlayerStats, playerNames: names }: any) => {
      store.myHand = hand
      store.myId = myId
      if (names) playerNames.value = names
      // Restore the table (cards + who played them, for per-player colours).
      store.tableCards = tableCards ?? []
      store.tablePlays = tablePlays ?? []
      store.deckCount = deck?.length || 0
      if (gamePlayers) {
        store.scores = {}
        for (const p of gamePlayers) store.scores[p.id] = p.score
        players.value = gamePlayers.map((p: any) => ({
          id: p.id,
          name: playerNames.value[p.id] || '?',
          cardCount: p.hand?.length || 0,
          score: p.score,
          wins: roomPlayerStats?.[p.id]?.wins || p.wins || 0,
          boxerWins: roomPlayerStats?.[p.id]?.boxerWins || p.boxerWins || 0,
        }))
      }
      if (gamePlayers && currentPlayerIndex !== undefined) {
        store.currentPlayerId = gamePlayers[currentPlayerIndex]?.id || ''
        store.isMyTurn = (gamePlayers[currentPlayerIndex]?.id === myId)
        if (store.isMyTurn) startCountdown(store)
      }
    })
  }

  return { players, playerNames, play, pass, boxerMove, setupListeners }
}
