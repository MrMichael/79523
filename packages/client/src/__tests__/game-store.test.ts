import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useGameStore } from '../../src/stores/game'
import { Suit, Rank } from '@79523/engine'

describe('GameStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const c = (suit: Suit, rank: Rank) => ({ suit, rank })

  describe('card selection', () => {
    it('selects a card', () => {
      const store = useGameStore()
      const card = c(Suit.Spade, Rank.Seven)
      store.selectCard(card)
      expect(store.selectedCards).toHaveLength(1)
      expect(store.selectedCards[0]).toEqual(card)
    })

    it('deselects a card when clicked again', () => {
      const store = useGameStore()
      const card = c(Suit.Spade, Rank.Seven)
      store.selectCard(card)
      store.selectCard(card)
      expect(store.selectedCards).toHaveLength(0)
    })

    it('selects multiple cards', () => {
      const store = useGameStore()
      const c1 = c(Suit.Spade, Rank.Seven)
      const c2 = c(Suit.Heart, Rank.Five)
      store.selectCard(c1)
      store.selectCard(c2)
      expect(store.selectedCards).toHaveLength(2)
    })

    it('selectedCount is computed correctly', () => {
      const store = useGameStore()
      expect(store.selectedCount).toBe(0)
      store.selectCard(c(Suit.Spade, Rank.Ace))
      expect(store.selectedCount).toBe(1)
      store.selectCard(c(Suit.Heart, Rank.King))
      expect(store.selectedCount).toBe(2)
    })
  })

  describe('hand management', () => {
    it('adds cards to hand', () => {
      const store = useGameStore()
      const cards = [c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.Five)]
      store.addToHand(cards)
      expect(store.myHand).toHaveLength(2)
    })

    it('removes cards from hand', () => {
      const store = useGameStore()
      const cards = [c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.Five), c(Suit.Club, Rank.Three)]
      store.addToHand(cards)
      store.removeFromHand([cards[0]])
      expect(store.myHand).toHaveLength(2)
      expect(store.myHand).not.toContainEqual(cards[0])
    })

    it('removes multiple played cards', () => {
      const store = useGameStore()
      const cards = [c(Suit.Spade, Rank.Five), c(Suit.Heart, Rank.Five), c(Suit.Club, Rank.Three)]
      store.addToHand(cards)
      store.removeFromHand([cards[0], cards[1]])
      expect(store.myHand).toHaveLength(1)
    })
  })

  describe('game state', () => {
    it('starts with default values', () => {
      const store = useGameStore()
      expect(store.myHand).toEqual([])
      expect(store.tableCards).toEqual([])
      expect(store.isMyTurn).toBe(false)
      expect(store.gameOver).toBe(false)
      expect(store.boxerPhase).toBe('idle')
    })

    it('tracks scores', () => {
      const store = useGameStore()
      store.scores = { p1: 10, p2: 20 }
      expect(store.scores.p1).toBe(10)
      expect(store.scores.p2).toBe(20)
    })

    it('tracks deck count', () => {
      const store = useGameStore()
      store.deckCount = 84
      expect(store.deckCount).toBe(84)
    })
  })

  describe('boxer state', () => {
    it('starts with idle boxer phase', () => {
      const store = useGameStore()
      expect(store.boxerPhase).toBe('idle')
      expect(store.boxerParticipants).toEqual([])
      expect(store.boxerMoves).toEqual({})
    })

    it('tracks boxer survivors', () => {
      const store = useGameStore()
      store.boxerSurvivors = ['p1', 'p2']
      expect(store.boxerSurvivors).toHaveLength(2)
      store.boxerSurvivors = store.boxerSurvivors.filter(id => id !== 'p1')
      expect(store.boxerSurvivors).toEqual(['p2'])
    })

    it('tracks boxer winner', () => {
      const store = useGameStore()
      store.boxerWinnerId = 'p1'
      expect(store.boxerWinnerId).toBe('p1')
    })
  })
})
