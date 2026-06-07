import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Card, GamePhase } from '@79523/engine'

export const useGameStore = defineStore('game', () => {
  const myHand = ref<Card[]>([])
  const tableCards = ref<Card[]>([])
  const selectedCards = ref<Card[]>([])
  const scores = ref<Record<string, number>>({})
  const isMyTurn = ref(false)
  const timeLeft = ref(30)
  const deckCount = ref(104)
  const phase = ref<GamePhase | ''>('')
  const currentPlayerId = ref('')
  const myId = ref('')
  const gameOver = ref(false)
  const lastPlayType = ref('')
  const lastPlayedCards = ref<Card[]>([])
  const lastPlayPlayer = ref('')
  const lastPassPlayer = ref('')
  const roundWinnerId = ref('')
  const roundScoreCards = ref<Card[]>([])
  const finalRankings = ref<{ id: string; totalScore: number }[]>([])
  const errorMessage = ref('')
  const trickVersion = ref(0)

  // Boxer state
  const boxerPhase = ref<'idle' | 'awaiting' | 'reveal' | 'eliminated' | 'done'>('idle')
  const boxerScoreCard = ref<Card | null>(null)
  const boxerParticipants = ref<string[]>([])
  const boxerMoves = ref<Record<string, string>>({})
  const boxerSurvivors = ref<string[]>([])
  const boxerWinnerId = ref('')
  const boxerCountdown = ref(3)
  const boxerGameScores = ref<Record<string, number>>({})
  const boxerWinCounts = ref<Record<string, number>>({})

  const selectedCount = computed(() => selectedCards.value.length)

  function selectCard(card: Card) {
    const idx = selectedCards.value.indexOf(card)
    if (idx >= 0) selectedCards.value.splice(idx, 1)
    else selectedCards.value.push(card)
  }
  function clearSelection() { selectedCards.value = [] }
  function removeFromHand(cards: Card[]) {
    // Remove one card per entry (handles 2-deck duplicates correctly)
    const hand = [...myHand.value]
    for (const card of cards) {
      const idx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank)
      if (idx >= 0) hand.splice(idx, 1)
    }
    myHand.value = hand
  }
  function addToHand(cards: Card[]) { myHand.value.push(...cards) }
  function clearError() { errorMessage.value = '' }
  function clearRoundBanner() { roundWinnerId.value = ''; roundScoreCards.value = [] }
  function bumpTrick() { trickVersion.value++ }

  // Debug: trace isMyTurn changes
  let _lastTurn = false
  setInterval(() => {
    if (isMyTurn.value !== _lastTurn) {
      _lastTurn = isMyTurn.value
      const stack = new Error().stack?.split('\n').slice(2, 6).join(' → ')
      console.log(`[STORE] isMyTurn → ${isMyTurn.value} hand:${myHand.value.length} cur:${currentPlayerId.value} myId:${myId.value}`)
    }
  }, 100)

  return {
    myHand, tableCards, selectedCards, scores, isMyTurn, timeLeft, deckCount,
    phase, currentPlayerId, myId, gameOver, lastPlayType, lastPlayedCards, lastPlayPlayer, lastPassPlayer, roundWinnerId, roundScoreCards, finalRankings,
    boxerPhase, boxerScoreCard, boxerParticipants, boxerMoves, boxerSurvivors, boxerWinnerId, boxerCountdown, boxerGameScores, boxerWinCounts,
    selectedCount, selectCard, clearSelection, removeFromHand, addToHand, clearRoundBanner, errorMessage, clearError, trickVersion, bumpTrick,
  }
})
