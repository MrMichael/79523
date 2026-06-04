import { describe, it, expect } from 'vitest'
import { createDeck, shuffle, draw } from '../deck'
import { Suit, Rank } from '../types'

describe('createDeck', () => {
  it('52 cards for 2-3 players', () => {
    expect(createDeck(2).length).toBe(52)
    expect(createDeck(3).length).toBe(52)
  })
  it('104 cards for 4-6 players', () => {
    expect(createDeck(4).length).toBe(104)
    expect(createDeck(6).length).toBe(104)
  })
  it('each rank appears 4 times per deck', () => {
    const deck = createDeck(2)
    const rc: Record<number, number> = {}
    for (const c of deck) rc[c.rank] = (rc[c.rank] || 0) + 1
    for (let r = 0; r <= 12; r++) expect(rc[r]).toBe(4)
  })
})

describe('shuffle', () => {
  it('same length', () => {
    const d = createDeck(2)
    expect(shuffle([...d]).length).toBe(d.length)
  })
  it('same multiset', () => {
    const d = createDeck(2)
    expect([...shuffle(d)].map(c => `${c.suit}-${c.rank}`).sort())
      .toEqual(d.map(c => `${c.suit}-${c.rank}`).sort())
  })
  it('does not mutate original', () => {
    const d = createDeck(2), copy = [...d]
    shuffle(d)
    expect(d).toEqual(copy)
  })
})

describe('draw', () => {
  it('draws N cards', () => {
    const d = createDeck(2)
    const { drawn, deck } = draw(d, 5)
    expect(drawn.length).toBe(5)
    expect(deck.length).toBe(d.length - 5)
  })
  it('draw 0 returns empty', () => {
    const d = createDeck(2)
    const { drawn, deck } = draw(d, 0)
    expect(drawn.length).toBe(0)
    expect(deck.length).toBe(d.length)
  })
  it('draw more than available returns all', () => {
    const d = createDeck(2)
    const { drawn, deck } = draw(d, 100)
    expect(drawn.length).toBe(52)
    expect(deck.length).toBe(0)
  })
})
