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

  const selectedCount = computed(() => selectedCards.value.length)

  function selectCard(card: Card) {
    const idx = selectedCards.value.findIndex(c => c.suit === card.suit && c.rank === card.rank)
    if (idx >= 0) selectedCards.value.splice(idx, 1)
    else selectedCards.value.push(card)
  }
  function clearSelection() { selectedCards.value = [] }
  function removeFromHand(cards: Card[]) {
    myHand.value = myHand.value.filter(c => !cards.some(pc => pc.suit === c.suit && pc.rank === c.rank))
  }
  function addToHand(cards: Card[]) { myHand.value.push(...cards) }

  return { myHand, tableCards, selectedCards, scores, isMyTurn, timeLeft, deckCount, phase, currentPlayerId, myId, selectedCount, selectCard, clearSelection, removeFromHand, addToHand }
})
