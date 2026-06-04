import { describe, it, expect } from 'vitest'
import { Suit, Rank, HandType, BoxerMove } from '../types'

describe('Suit ordering', () => {
  it('Spade is the highest suit (0)', () => {
    expect(Suit.Spade).toBe(0)
  })
  it('Diamond is the lowest suit (3)', () => {
    expect(Suit.Diamond).toBe(3)
  })
})

describe('Rank ordering', () => {
  it('Seven is the highest rank (12)', () => {
    expect(Rank.Seven).toBe(12)
  })
  it('Four is the lowest rank (0)', () => {
    expect(Rank.Four).toBe(0)
  })
  it('Nine is second highest (11)', () => {
    expect(Rank.Nine).toBe(11)
  })
  it('Five is third highest (10)', () => {
    expect(Rank.Five).toBe(10)
  })
})

describe('HandType values', () => {
  it('all hand types defined', () => {
    expect(HandType.Single).toBe('single')
    expect(HandType.Pair).toBe('pair')
    expect(HandType.Bike).toBe('bike')
    expect(HandType.Triple).toBe('triple')
    expect(HandType.Root).toBe('root')
  })
})

describe('BoxerMove values', () => {
  it('all moves defined', () => {
    expect(BoxerMove.Rock).toBe('rock')
    expect(BoxerMove.Scissors).toBe('scissors')
    expect(BoxerMove.Paper).toBe('paper')
  })
})
