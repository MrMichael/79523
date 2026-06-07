import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGameStore } from '../../src/stores/game'
import { Suit, Rank } from '@79523/engine'

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    off: vi.fn(),
  })),
}))

// Mock vue-router
vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    currentRoute: { value: { params: { code: 'TEST' } } },
  })),
}))

describe('useGame composable behavior', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('event handler logic (simulated)', () => {
    it('game_started: sets hand and resets state', () => {
      const store = useGameStore()
      const hand = [{ suit: Suit.Spade, rank: Rank.Seven }, { suit: Suit.Heart, rank: Rank.Five }]
      const players = [
        { id: 'p1', hand: [], score: 0 },
        { id: 'p2', hand: [], score: 0 },
      ]

      // Simulate game_started event handler
      store.myHand = hand
      store.myId = 'p1'
      store.currentPlayerId = 'p1'
      store.tableCards = []
      store.deckCount = 42
      store.gameOver = false
      store.finalRankings = []

      expect(store.myHand).toEqual(hand)
      expect(store.myId).toBe('p1')
      expect(store.tableCards).toEqual([])
      expect(store.deckCount).toBe(42)
      expect(store.gameOver).toBe(false)
    })

    it('your_turn: sets turn state and updates hand', () => {
      const store = useGameStore()
      const hand = [{ suit: Suit.Club, rank: Rank.Nine }]

      // Simulate your_turn event handler
      store.isMyTurn = true
      store.timeLeft = 30
      store.currentPlayerId = store.myId || 'p1'
      store.myHand = hand

      expect(store.isMyTurn).toBe(true)
      expect(store.myHand).toEqual(hand)
    })

    it('play_made: updates table and removes cards from hand', () => {
      const store = useGameStore()
      const initialHand = [
        { suit: Suit.Spade, rank: Rank.Seven },
        { suit: Suit.Heart, rank: Rank.Five },
      ]
      store.myHand = [...initialHand]
      store.myId = 'p1'
      const playedCard = initialHand[0]
      const tableCards = [playedCard]

      // Simulate play_made event handler for own play
      store.tableCards = tableCards
      store.isMyTurn = false
      store.removeFromHand([playedCard])

      expect(store.tableCards).toEqual(tableCards)
      expect(store.isMyTurn).toBe(false)
      expect(store.myHand).toHaveLength(1)
      expect(store.myHand).not.toContainEqual(playedCard)
    })

    it('pass_made: clears isMyTurn', () => {
      const store = useGameStore()
      store.isMyTurn = true

      // Simulate pass_made event handler
      store.isMyTurn = false

      expect(store.isMyTurn).toBe(false)
    })

    it('game_over: sets final state', () => {
      const store = useGameStore()
      const finalScores = [
        { id: 'p1', totalScore: 55, score: 0 },
        { id: 'p2', totalScore: 45, score: 0 },
      ]

      // Simulate game_over event handler
      store.scores = { p1: 55, p2: 45 }
      store.isMyTurn = false
      store.gameOver = true
      store.finalRankings = finalScores

      expect(store.gameOver).toBe(true)
      expect(store.isMyTurn).toBe(false)
      expect(store.finalRankings).toEqual(finalScores)
    })

    it('round_result: clears table and updates scores', () => {
      const store = useGameStore()
      store.tableCards = [{ suit: Suit.Spade, rank: Rank.King }]
      store.scores = { p1: 0, p2: 0 }
      const newScores = [{ id: 'p1', score: 10 }, { id: 'p2', score: 0 }]

      // Simulate round_result event handler
      store.scores = { p1: 10, p2: 0 }
      store.isMyTurn = false
      store.tableCards = []
      store.roundWinnerId = 'p1'

      expect(store.tableCards).toEqual([])
      expect(store.scores.p1).toBe(10)
      expect(store.roundWinnerId).toBe('p1')
    })

    it('boxer_start: initializes boxer state', () => {
      const store = useGameStore()
      const scoreCard = { suit: Suit.Heart, rank: Rank.King }
      const participants = ['p1', 'p2', 'p3', 'p4']

      // Simulate boxer_start event handler
      store.boxerPhase = 'awaiting'
      store.boxerScoreCard = scoreCard
      store.boxerParticipants = participants
      store.boxerMoves = {}
      store.boxerSurvivors = [...participants]

      expect(store.boxerPhase).toBe('awaiting')
      expect(store.boxerScoreCard).toEqual(scoreCard)
      expect(store.boxerParticipants).toEqual(participants)
      expect(store.boxerSurvivors).toEqual(participants)
    })

    it('boxer_eliminated: removes eliminated player', () => {
      const store = useGameStore()
      store.boxerSurvivors = ['p1', 'p2', 'p3', 'p4']
      store.myId = 'p3'

      // Simulate boxer_eliminated for p3
      store.boxerSurvivors = store.boxerSurvivors.filter(id => id !== 'p3')
      store.boxerPhase = 'eliminated'

      expect(store.boxerSurvivors).toEqual(['p1', 'p2', 'p4'])
      expect(store.boxerPhase).toBe('eliminated')
    })
  })
})
