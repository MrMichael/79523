import { describe, it, expect } from 'vitest'
import { identify, beats } from '../judge'
import { HandType, Suit, Rank } from '../types'
import type { Play } from '../types'

const c = (suit: Suit, rank: Rank) => ({ suit, rank })

describe('identify', () => {
  it('identifies single card', () => {
    const play = identify([c(Suit.Spade, Rank.Seven)])
    expect(play).not.toBeNull()
    expect(play!.type).toBe(HandType.Single)
  })
  it('identifies pair', () => {
    const play = identify([c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.Seven)])
    expect(play).not.toBeNull()
    expect(play!.type).toBe(HandType.Pair)
    expect(play!.primaryRank).toBe(Rank.Seven)
  })
  it('rejects two different cards', () => {
    expect(identify([c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.Nine)])).toBeNull()
  })
  it('identifies bike (pair + any single)', () => {
    const play = identify([c(Suit.Spade, Rank.Five), c(Suit.Heart, Rank.Five), c(Suit.Club, Rank.Four)])
    expect(play).not.toBeNull()
    expect(play!.type).toBe(HandType.Bike)
    expect(play!.primaryRank).toBe(Rank.Five)
  })
  it('three same = triple, not bike', () => {
    const play = identify([c(Suit.Spade, Rank.Five), c(Suit.Heart, Rank.Five), c(Suit.Club, Rank.Five)])
    expect(play!.type).toBe(HandType.Triple)
  })
  it('identifies triple', () => {
    const play = identify([c(Suit.Spade, Rank.Two), c(Suit.Heart, Rank.Two), c(Suit.Club, Rank.Two)])
    expect(play).not.toBeNull()
    expect(play!.type).toBe(HandType.Triple)
    expect(play!.primaryRank).toBe(Rank.Two)
  })
  it('identifies root (two pairs + single)', () => {
    const cards = [c(Suit.Spade, Rank.Five), c(Suit.Heart, Rank.Five), c(Suit.Club, Rank.Three), c(Suit.Diamond, Rank.Three), c(Suit.Spade, Rank.Four)]
    const play = identify(cards)
    expect(play).not.toBeNull()
    expect(play!.type).toBe(HandType.Root)
    expect(play!.primaryRank).toBe(Rank.Five)
  })
  it('identifies two pairs (2+2) as Root', () => {
    const play = identify([c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.Seven), c(Suit.Club, Rank.Five), c(Suit.Diamond, Rank.Five)])
    expect(play).not.toBeNull()
    expect(play!.type).toBe(HandType.Root)
    expect(play!.primaryRank).toBe(Rank.Seven)
    expect(play!.secondaryRank).toBe(Rank.Five)
  })
  it('returns null for empty', () => {
    expect(identify([])).toBeNull()
  })
  it('root: pairs not adjacent in input', () => {
    const cards = [c(Suit.Spade, Rank.King), c(Suit.Heart, Rank.Ace), c(Suit.Diamond, Rank.King), c(Suit.Club, Rank.Ace), c(Suit.Spade, Rank.Four)]
    const play = identify(cards)
    expect(play).not.toBeNull()
    expect(play!.type).toBe(HandType.Root)
    expect(play!.primaryRank).toBe(Rank.Ace)
  })
  it('identifies quads + single (4+1) as Root', () => {
    const cards = [c(Suit.Spade, Rank.King), c(Suit.Heart, Rank.King), c(Suit.Club, Rank.King), c(Suit.Diamond, Rank.King), c(Suit.Spade, Rank.Two)]
    const play = identify(cards)
    expect(play).not.toBeNull()
    expect(play!.type).toBe(HandType.Root)
    expect(play!.primaryRank).toBe(Rank.King)
  })
})

describe('identify edge cases', () => {
  it('rejects 4 cards that are not two pairs', () => {
    expect(identify([
      c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.Seven),
      c(Suit.Club, Rank.Seven), c(Suit.Diamond, Rank.Five),
    ])).toBeNull()
  })
  it('rejects 6 cards', () => {
    expect(identify([
      c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.Seven),
      c(Suit.Club, Rank.Five), c(Suit.Diamond, Rank.Five),
      c(Suit.Spade, Rank.Three), c(Suit.Heart, Rank.Three),
    ])).toBeNull()
  })
  it('full house (3+2) is valid Root', () => {
    const play = identify([
      c(Suit.Spade, Rank.Five), c(Suit.Heart, Rank.Five), c(Suit.Club, Rank.Five),
      c(Suit.Diamond, Rank.King), c(Suit.Spade, Rank.King),
    ])
    expect(play).not.toBeNull()
    expect(play!.type).toBe(HandType.Root)
    expect(play!.primaryRank).toBe(Rank.Five)
    expect(play!.secondaryRank).toBe(Rank.King)
  })
  it('correctly identifies all 5 hand types', () => {
    const single = identify([c(Suit.Spade, Rank.Seven)])
    const pair = identify([c(Suit.Spade, Rank.Five), c(Suit.Heart, Rank.Five)])
    const bike = identify([c(Suit.Spade, Rank.Five), c(Suit.Heart, Rank.Five), c(Suit.Club, Rank.Four)])
    const triple = identify([c(Suit.Spade, Rank.Two), c(Suit.Heart, Rank.Two), c(Suit.Club, Rank.Two)])
    const root = identify([c(Suit.Spade, Rank.Ace), c(Suit.Heart, Rank.Ace), c(Suit.Club, Rank.King), c(Suit.Diamond, Rank.King), c(Suit.Spade, Rank.Four)])
    expect(single!.type).toBe('single')
    expect(pair!.type).toBe('pair')
    expect(bike!.type).toBe('bike')
    expect(triple!.type).toBe('triple')
    expect(root!.type).toBe('root')
  })
})

describe('beats', () => {
  it('same type: higher rank wins', () => {
    const p1: Play = { type: HandType.Single, cards: [c(Suit.Spade, Rank.Seven)], primaryRank: Rank.Seven }
    const p2: Play = { type: HandType.Single, cards: [c(Suit.Heart, Rank.Four)], primaryRank: Rank.Four }
    expect(beats(p1, p2)).toBe(true)
  })
  it('same type and rank: higher suit wins', () => {
    const p1: Play = { type: HandType.Single, cards: [c(Suit.Spade, Rank.Ace)], primaryRank: Rank.Ace }
    const p2: Play = { type: HandType.Single, cards: [c(Suit.Diamond, Rank.Ace)], primaryRank: Rank.Ace }
    expect(beats(p1, p2)).toBe(true)
  })
  it('different types: cannot beat', () => {
    const pair: Play = { type: HandType.Pair, cards: [c(Suit.Spade, Rank.Four), c(Suit.Heart, Rank.Four)], primaryRank: Rank.Four }
    const single: Play = { type: HandType.Single, cards: [c(Suit.Spade, Rank.Seven)], primaryRank: Rank.Seven }
    expect(beats(pair, single)).toBe(false)
  })
  it('root: compares by bigger pair', () => {
    const r1: Play = { type: HandType.Root, cards: [], primaryRank: Rank.Five, secondaryRank: Rank.Three }
    const r2: Play = { type: HandType.Root, cards: [], primaryRank: Rank.Nine, secondaryRank: Rank.Four }
    expect(beats(r2, r1)).toBe(true)
  })
  it('root same primary: compares secondary', () => {
    const r1: Play = { type: HandType.Root, cards: [], primaryRank: Rank.Five, secondaryRank: Rank.Two }
    const r2: Play = { type: HandType.Root, cards: [], primaryRank: Rank.Five, secondaryRank: Rank.Four }
    expect(beats(r1, r2)).toBe(true)
  })
  it('bike: compares by pair', () => {
    const b1: Play = { type: HandType.Bike, cards: [], primaryRank: Rank.Five }
    const b2: Play = { type: HandType.Bike, cards: [], primaryRank: Rank.Two }
    expect(beats(b1, b2)).toBe(true)
  })
  it('triple beats bike: higher rank wins', () => {
    const triple: Play = { type: HandType.Triple, cards: [], primaryRank: Rank.Five }
    const bike: Play = { type: HandType.Bike, cards: [], primaryRank: Rank.Two }
    expect(beats(triple, bike)).toBe(true)
  })
  it('triple cannot beat bike: lower or equal rank loses', () => {
    const triple: Play = { type: HandType.Triple, cards: [], primaryRank: Rank.Three }
    const bike: Play = { type: HandType.Bike, cards: [], primaryRank: Rank.Five }
    expect(beats(triple, bike)).toBe(false)
  })
  it('bike cannot beat triple (one-way rule)', () => {
    const bike: Play = { type: HandType.Bike, cards: [], primaryRank: Rank.Nine }
    const triple: Play = { type: HandType.Triple, cards: [], primaryRank: Rank.Two }
    expect(beats(bike, triple)).toBe(false)
  })
})
