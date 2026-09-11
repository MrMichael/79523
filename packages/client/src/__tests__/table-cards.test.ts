import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { Suit, Rank } from '@79523/engine'
import TableCards from '../components/game/TableCards.vue'

const c = (suit: Suit, rank: Rank) => ({ suit, rank })

describe('TableCards', () => {
  it('groups plays and colors them by owner', () => {
    const w = mount(TableCards, {
      props: {
        cards: [c(Suit.Spade, Rank.Seven)],
        plays: [{ playerId: 'p1', cards: [c(Suit.Spade, Rank.Seven)] }],
        colorMap: { p1: '#ef4444' },
      },
    })
    const group = w.find('.play-group')
    expect(group.exists()).toBe(true)
    // borderColor is applied from the player's color
    expect(group.attributes('style')).toMatch(/ef4444|rgb\(239,\s*68,\s*68\)/)
    expect(w.findAll('.card')).toHaveLength(1)
  })

  it('falls back to flat cards when no play ownership is available', () => {
    const w = mount(TableCards, {
      props: { cards: [c(Suit.Heart, Rank.Five), c(Suit.Club, Rank.King)] },
    })
    expect(w.findAll('.play-group')).toHaveLength(0)
    expect(w.findAll('.card')).toHaveLength(2)
  })
})
