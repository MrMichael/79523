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
  it('returns null for 4 cards', () => {
    expect(identify([c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.Seven), c(Suit.Club, Rank.Five), c(Suit.Diamond, Rank.Five)])).toBeNull()
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
    const r1: Play = { type: HandType.Root, cards: [], primaryRank: Rank.Five, secondaryRank: Rank.Three }
    const r2: Play = { type: HandType.Root, cards: [], primaryRank: Rank.Five, secondaryRank: Rank.Four }
    expect(beats(r2, r1)).toBe(true)
  })
  it('bike: compares by pair', () => {
    const b1: Play = { type: HandType.Bike, cards: [], primaryRank: Rank.Five }
    const b2: Play = { type: HandType.Bike, cards: [], primaryRank: Rank.Two }
    expect(beats(b1, b2)).toBe(true)
  })
})
