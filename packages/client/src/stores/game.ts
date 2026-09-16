import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Card, GamePhase } from '@79523/engine'
import type { ChatMessage } from '@/types'

/** How long a chat bubble stays above a player's seat. */
const CHAT_BUBBLE_MS = 3000
/** Cap on the in-memory room chat log. */
const CHAT_LOG_MAX = 50
const bubbleTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const useGameStore = defineStore('game', () => {
  const myHand = ref<Card[]>([])
  const tableCards = ref<Card[]>([])
  const tablePlays = ref<{ playerId: string; cards: Card[] }[]>([])
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
  const boxerWinPoints = ref(0)
  const boxerWinCounts = ref<Record<string, number>>({})
  const boxerSubmitted = ref(false)

  // Surrender (交粮) state — held here so a reconnect/reload can restore the overlay.
  const surrenderActive = ref(false)
  const surrenderPhase = ref<'losers_give' | 'winners_pick' | 'winners_return' | ''>('')
  const surrenderRole = ref<'loser' | 'winner' | 'spectator'>('spectator')
  const surrenderHand = ref<Card[]>([])
  const surrenderInfo = ref('')
  const surrenderPickCards = ref<{ playerId: string; playerName: string; card: Card }[]>([])
  /** Filled when the tribute completes, so the overlay can show what each loser gave/received. */
  const surrenderResult = ref<{ id: string; gaveUpCard: Card; receivedCard: Card }[]>([])

  // Quick chat (常用语) — in memory only, per room, cleared when a new game starts.
  const chatMessages = ref<ChatMessage[]>([])
  const chatBubbles = ref<Record<string, string>>({})
  const chatOpen = ref(false)
  const chatUnread = ref(0)

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
  function addChat(m: ChatMessage) {
    chatMessages.value.push(m)
    if (chatMessages.value.length > CHAT_LOG_MAX) {
      chatMessages.value.splice(0, chatMessages.value.length - CHAT_LOG_MAX)
    }
    // Speech bubble above the speaker's seat, refreshed if they talk again.
    chatBubbles.value[m.playerId] = m.text
    const prev = bubbleTimers.get(m.playerId)
    if (prev) clearTimeout(prev)
    bubbleTimers.set(m.playerId, setTimeout(() => {
      delete chatBubbles.value[m.playerId]
      bubbleTimers.delete(m.playerId)
    }, CHAT_BUBBLE_MS))
    if (!chatOpen.value) chatUnread.value++
  }
  function openChat() { chatOpen.value = true; chatUnread.value = 0 }
  function closeChat() { chatOpen.value = false }
  function clearChat() {
    chatMessages.value = []
    chatBubbles.value = {}
    chatUnread.value = 0
    for (const t of bubbleTimers.values()) clearTimeout(t)
    bubbleTimers.clear()
  }
  function clearRoundBanner() { roundWinnerId.value = ''; roundScoreCards.value = [] }
  function bumpTrick() { trickVersion.value++ }

  function reset() {
    myHand.value = []
    tableCards.value = []
    tablePlays.value = []
    selectedCards.value = []
    scores.value = {}
    isMyTurn.value = false
    timeLeft.value = 30
    deckCount.value = 104
    phase.value = ''
    currentPlayerId.value = ''
    myId.value = ''
    gameOver.value = false
    lastPlayType.value = ''
    lastPlayedCards.value = []
    lastPlayPlayer.value = ''
    lastPassPlayer.value = ''
    roundWinnerId.value = ''
    roundScoreCards.value = []
    finalRankings.value = []
    errorMessage.value = ''
    trickVersion.value = 0
    boxerPhase.value = 'idle'
    boxerScoreCard.value = null
    boxerParticipants.value = []
    boxerMoves.value = {}
    boxerSurvivors.value = []
    boxerWinnerId.value = ''
    boxerCountdown.value = 3
    boxerGameScores.value = {}
    boxerWinPoints.value = 0
    boxerWinCounts.value = {}
    boxerSubmitted.value = false
    surrenderActive.value = false
    surrenderPhase.value = ''
    surrenderRole.value = 'spectator'
    surrenderHand.value = []
    surrenderInfo.value = ''
    surrenderPickCards.value = []
    surrenderResult.value = []
    clearChat()
  }

  return {
    myHand, tableCards, tablePlays, selectedCards, scores, isMyTurn, timeLeft, deckCount,
    phase, currentPlayerId, myId, gameOver, lastPlayType, lastPlayedCards, lastPlayPlayer, lastPassPlayer, roundWinnerId, roundScoreCards, finalRankings,
    boxerPhase, boxerScoreCard, boxerParticipants, boxerMoves, boxerSurvivors, boxerWinnerId, boxerCountdown, boxerGameScores, boxerWinCounts, boxerWinPoints, boxerSubmitted,
    surrenderActive, surrenderPhase, surrenderRole, surrenderHand, surrenderInfo, surrenderPickCards, surrenderResult,
    chatMessages, chatBubbles, chatOpen, chatUnread, addChat, openChat, closeChat, clearChat,
    selectedCount, selectCard, clearSelection, removeFromHand, addToHand, clearRoundBanner, errorMessage, clearError, trickVersion, bumpTrick, reset,
  }
})
