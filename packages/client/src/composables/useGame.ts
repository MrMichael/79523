import { ref } from 'vue'
import { useSocket } from './useSocket'
import type { Card } from '@79523/engine'

export function useGame() {
  const { socket } = useSocket()
  const myHand = ref<Card[]>([])
  const tableCards = ref<Card[]>([])
  const scores = ref<Record<string, number>>({})
  const isMyTurn = ref(false)
  const timeLeft = ref(30)
  const deckCount = ref(0)

  function play(cards: Card[]) { socket.value?.emit('play', { cards }) }
  function pass() { socket.value?.emit('pass') }

  function setupListeners() {
    socket.value?.on('game_started', ({ hand, players }: any) => {
      myHand.value = hand
      for (const p of players) scores.value[p.id] = p.score
    })
    socket.value?.on('your_turn', ({ timeout }: any) => { isMyTurn.value = true; timeLeft.value = timeout })
    socket.value?.on('play_made', ({ tableCards: tc }: any) => { tableCards.value = tc; isMyTurn.value = false })
    socket.value?.on('round_result', ({ scores: newScores }: any) => {
      for (const s of newScores) scores.value[s.id] = s.score
    })
    socket.value?.on('draw_card', ({ cards }: any) => { myHand.value.push(...cards) })
    socket.value?.on('game_over', ({ scores: finalScores }: any) => {
      for (const s of finalScores) scores.value[s.id] = s.totalScore
    })
    socket.value?.on('full_state', ({ myHand: hand, deck }: any) => {
      myHand.value = hand; deckCount.value = deck?.length || 0
    })
  }

  return { myHand, tableCards, scores, isMyTurn, timeLeft, deckCount, play, pass, setupListeners }
}
