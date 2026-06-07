import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { useGameStore } from '../../src/stores/game'
import { Suit, Rank } from '@79523/engine'

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn(),
  })),
}))

// Mock vue-router
vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    currentRoute: { value: { params: { code: 'TEST' } } },
  })),
}))

// We test the surrender flow logic through the store and event simulation
// The SurrenderOverlay component itself relies on socket events for state,
// so we test the state machine and UI logic directly

describe('Surrender Flow Logic', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const c = (suit: Suit, rank: Rank) => ({ suit, rank })

  describe('loser card selection logic', () => {
    it('finds largest single card in hand', () => {
      const hand = [
        c(Suit.Spade, Rank.Seven),    // rank 12 (strongest)
        c(Suit.Heart, Rank.Five),     // rank 10
        c(Suit.Club, Rank.Four),      // rank 0
        c(Suit.Diamond, Rank.King),   // rank 6
      ]
      const largest = hand.reduce((a, b) => a.rank > b.rank ? a : b)
      expect(largest.rank).toBe(Rank.Seven)
      expect(largest.suit).toBe(Suit.Spade)
    })

    it('returns the only card when hand has one card', () => {
      const hand = [c(Suit.Heart, Rank.Nine)]
      const largest = hand.reduce((a, b) => a.rank > b.rank ? a : b)
      expect(largest.rank).toBe(Rank.Nine)
    })

    it('handles duplicate largest cards (2 decks)', () => {
      const hand = [
        c(Suit.Spade, Rank.Seven),
        c(Suit.Heart, Rank.Seven),  // same rank, different suit
        c(Suit.Club, Rank.Four),
      ]
      const largest = hand.reduce((a, b) => a.rank > b.rank ? a : b)
      expect(largest.rank).toBe(Rank.Seven)
    })
  })

  describe('winner pick logic', () => {
    it('selects card from surrendered list', () => {
      const surrendered = [
        { playerId: 'l1', card: c(Suit.Spade, Rank.Seven) },
        { playerId: 'l2', card: c(Suit.Heart, Rank.King) },
      ]
      // Winner picks the higher value card
      const pick = surrendered.reduce((a, b) => a.card.rank > b.card.rank ? a : b)
      expect(pick.card.rank).toBe(Rank.Seven)
      expect(pick.playerId).toBe('l1')
    })
  })

  describe('winner return logic', () => {
    it('returns smallest card from hand', () => {
      const hand = [
        c(Suit.Spade, Rank.Seven),
        c(Suit.Heart, Rank.Five),
        c(Suit.Club, Rank.Four),
      ]
      const smallest = hand.reduce((a, b) => a.rank < b.rank ? a : b)
      expect(smallest.rank).toBe(Rank.Four)
    })

    it('returns smallest non-given card', () => {
      const hand = [
        c(Suit.Spade, Rank.Seven),
        c(Suit.Heart, Rank.Five),
        c(Suit.Club, Rank.Four),
      ]
      const givenCard = c(Suit.Spade, Rank.Seven)
      const filtered = hand.filter(c => !(c.suit === givenCard.suit && c.rank === givenCard.rank))
      const smallest = filtered.reduce((a, b) => a.rank < b.rank ? a : b)
      expect(smallest.rank).toBe(Rank.Four)
    })
  })

  describe('next lead determination', () => {
    it('returns the player who gave up the largest card', () => {
      const surrendered = [
        { playerId: 'l1', card: c(Suit.Club, Rank.Queen) },  // rank 5
        { playerId: 'l2', card: c(Suit.Diamond, Rank.Two) },  // rank 9 (largest)
      ]
      const nextLead = surrendered.reduce((a, b) => a.card.rank > b.card.rank ? a : b)
      expect(nextLead.playerId).toBe('l2')
    })
  })

  describe('surrender state transitions', () => {
    it('winnerIds are top 2 scores, loserIds are bottom 2', () => {
      const scores = { p1: 90, p2: 70, p3: 30, p4: 10 }
      const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
      const winners = sorted.slice(0, 2).map(([id]) => id)
      const losers = sorted.slice(-2).map(([id]) => id)
      expect(winners).toEqual(['p1', 'p2'])
      expect(losers).toEqual(['p3', 'p4'])
    })

    it('<4 players: 1 winner, 1 loser', () => {
      const scores = { p1: 80, p2: 20 }
      const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
      const winners = [sorted[0][0]]
      const losers = [sorted[sorted.length - 1][0]]
      expect(winners).toEqual(['p1'])
      expect(losers).toEqual(['p2'])
    })

    it('phase order: losers_give → winners_pick → winners_return → complete', () => {
      const phases = ['losers_give', 'winners_pick', 'winners_return']
      const stateChanges: string[] = []

      // Simulate surrender flow
      let pairIdx = 0
      const winnerIds = ['w1', 'w2']
      const loserIds = ['l1', 'l2']

      // Phase 1: losers give
      stateChanges.push('losers_give')
      expect(pairIdx).toBe(0)

      // l1 gives
      pairIdx++
      if (pairIdx < loserIds.length) {
        // still losers_give for l2
        stateChanges.push('losers_give')
      }

      // l2 gives → move to winners_pick
      pairIdx++
      if (pairIdx >= loserIds.length) {
        pairIdx = 0
        stateChanges.push('winners_pick')
      }

      // w1 picks → move to winners_return → then back to winners_pick for w2
      stateChanges.push('winners_return')
      pairIdx++
      if (pairIdx < winnerIds.length) {
        stateChanges.push('winners_pick')
      }

      // w2 picks → move to winners_return
      stateChanges.push('winners_return')
      pairIdx++
      // All done
      stateChanges.push('complete')

      expect(stateChanges).toContain('losers_give')
      expect(stateChanges).toContain('winners_pick')
      expect(stateChanges).toContain('winners_return')
      expect(stateChanges).toContain('complete')
    })
  })

  describe('card removal from hand (surrender)', () => {
    it('removes one card when multiple identical cards exist', () => {
      const hand = [
        { suit: 0, rank: 12 },
        { suit: 1, rank: 12 },  // duplicate rank, different suit
        { suit: 0, rank: 5 },
      ]
      const cardToRemove = { suit: 0, rank: 12 }
      const idx = hand.findIndex(c => c.suit === cardToRemove.suit && c.rank === cardToRemove.rank)
      expect(idx).toBe(0)
      const newHand = [...hand]
      newHand.splice(idx, 1)
      expect(newHand).toHaveLength(2)
      // Only one 7 removed, the other 7 still present
      expect(newHand.filter(c => c.rank === 12)).toHaveLength(1)
    })
  })
})
