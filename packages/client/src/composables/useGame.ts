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
const players = ref<{ id: string; name: string; cardCount: number; score: number }[]>([])
const playerNames = ref<Record<string, string>>({})

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

    socket.value?.on('boxer_start', ({ scoreCard, participants, gameScores, boxerWins }: any) => {
      clog('boxer_start', { participants: participants?.length })
      store.boxerScoreCard = scoreCard
      store.boxerParticipants = participants
      store.boxerMoves = {}
      store.boxerSurvivors = [...participants]
      store.boxerCountdown = 3
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

    socket.value?.on('boxer_winner', ({ playerId, scoreCard }: any) => {
      store.boxerWinnerId = playerId
      store.boxerScoreCard = scoreCard
      // Boxer phase stays 'reveal' or transitions — next boxer_start will reset
    })

    socket.value?.on('surrender_start', (data: any) => {
      clog('surrender_start', { phase: data.phase, role: data.yourRole, hand: data.hand?.length })
      if (data.hand) store.myHand = data.hand
    })

    socket.value?.on('surrender_update', (data: any) => {
      clog('surrender_update', { phase: data.phase, info: data.info })
    })

    socket.value?.on('surrender_swap', ({ losers }: any) => {
      clog('surrender_swap', losers?.map((l:any) => l.id))
    })

    socket.value?.on('next_game_lead', () => {
      clog('next_game_lead')
      store.boxerPhase = 'idle'
      store.boxerScoreCard = null
      store.boxerParticipants = []
      store.boxerMoves = {}
      store.boxerSurvivors = []
      store.boxerWinnerId = ''
    })

    socket.value?.on('full_state', ({ myHand: hand, deck, players: gamePlayers, currentPlayerIndex, myId }: any) => {
      store.myHand = hand
      store.myId = myId
      store.deckCount = deck?.length || 0
      if (gamePlayers) {
        store.scores = {}
        for (const p of gamePlayers) store.scores[p.id] = p.score
        players.value = gamePlayers.map((p: any) => ({
          id: p.id,
          name: playerNames.value[p.id] || '?',
          cardCount: p.hand?.length || 0,
          score: p.score,
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
