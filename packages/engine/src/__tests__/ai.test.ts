import { describe, it, expect } from 'vitest'
import { choosePlay, chooseBoxerMove, chooseSurrenderGive, chooseSurrenderPick, chooseSurrenderReturn } from '../ai'
import { Suit, Rank, HandType, BoxerMove } from '../types'
import type { Card, Play } from '../types'

const c = (suit: Suit, rank: Rank): Card => ({ suit, rank })
const single = (rank: Rank): Play => ({ type: HandType.Single, cards: [c(Suit.Spade, rank)], primaryRank: rank })

describe('choosePlay', () => {
  it('returns null on empty hand', () => {
    expect(choosePlay({ hand: [], currentBestPlay: null })).toBeNull()
  })

  it('leading: plays the whole hand when it is a valid combo (go out)', () => {
    const hand = [c(Suit.Spade, Rank.Five), c(Suit.Heart, Rank.Five)]
    expect(choosePlay({ hand, currentBestPlay: null })).toEqual(hand)
  })

  it('leading: otherwise leads the smallest single', () => {
    const hand = [c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.Four)]
    expect(choosePlay({ hand, currentBestPlay: null })).toEqual([c(Suit.Heart, Rank.Four)])
  })

  it('responding: plays the weakest card that beats the current best', () => {
    const hand = [c(Suit.Spade, Rank.Eight), c(Suit.Heart, Rank.Six), c(Suit.Club, Rank.Four)]
    expect(choosePlay({ hand, currentBestPlay: single(Rank.Four) })).toEqual([c(Suit.Heart, Rank.Six)])
  })

  it('responding: passes when nothing beats the current best', () => {
    const hand = [c(Suit.Spade, Rank.Four)]
    expect(choosePlay({ hand, currentBestPlay: single(Rank.Seven) })).toBeNull()
  })

  it('responding: prefers the matching combo type (pair over a pair)', () => {
    const best: Play = { type: HandType.Pair, cards: [c(Suit.Spade, Rank.Four), c(Suit.Heart, Rank.Four)], primaryRank: Rank.Four }
    const hand = [c(Suit.Spade, Rank.Six), c(Suit.Heart, Rank.Six), c(Suit.Club, Rank.Nine)]
    expect(choosePlay({ hand, currentBestPlay: best })).toEqual([c(Suit.Spade, Rank.Six), c(Suit.Heart, Rank.Six)])
  })
})

describe('chooseBoxerMove', () => {
  it('maps rand() to a valid move', () => {
    expect(chooseBoxerMove(() => 0)).toBe(BoxerMove.Rock)
    expect(chooseBoxerMove(() => 0.5)).toBe(BoxerMove.Paper)
    expect(chooseBoxerMove(() => 0.99)).toBe(BoxerMove.Scissors)
  })
})

describe('surrender choices', () => {
  it('give: returns the largest single card', () => {
    const hand = [c(Suit.Spade, Rank.Four), c(Suit.Heart, Rank.Seven), c(Suit.Club, Rank.King)]
    expect(chooseSurrenderGive(hand)).toEqual(c(Suit.Heart, Rank.Seven))
  })
  it('pick: returns the largest card', () => {
    const cards = [c(Suit.Spade, Rank.Four), c(Suit.Club, Rank.King)]
    expect(chooseSurrenderPick(cards)).toEqual(c(Suit.Club, Rank.King))
  })
  it('return: returns the smallest card', () => {
    const hand = [c(Suit.Spade, Rank.Seven), c(Suit.Club, Rank.Four)]
    expect(chooseSurrenderReturn(hand)).toEqual(c(Suit.Club, Rank.Four))
  })
})
