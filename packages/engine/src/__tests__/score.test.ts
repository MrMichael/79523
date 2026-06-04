import { describe, it, expect } from 'vitest'
import { calculateScore, isScoreCard, getScoreCards, needsBoxer } from '../score'
import { Suit, Rank } from '../types'

describe('isScoreCard', () => {
  it('5 is score card', () => expect(isScoreCard({suit:Suit.Spade, rank:Rank.Five})).toBe(true))
  it('10 is score card', () => expect(isScoreCard({suit:Suit.Heart, rank:Rank.Ten})).toBe(true))
  it('K is score card', () => expect(isScoreCard({suit:Suit.Club, rank:Rank.King})).toBe(true))
  it('7 is not', () => expect(isScoreCard({suit:Suit.Spade, rank:Rank.Seven})).toBe(false))
  it('A is not', () => expect(isScoreCard({suit:Suit.Diamond, rank:Rank.Ace})).toBe(false))
})

describe('calculateScore', () => {
  it('5=5, 10=10, K=10', () => {
    expect(calculateScore([{suit:Suit.Spade, rank:Rank.Five}, {suit:Suit.Heart, rank:Rank.Ten}, {suit:Suit.Club, rank:Rank.King}])).toBe(25)
  })
  it('non-score cards = 0', () => {
    expect(calculateScore([{suit:Suit.Spade, rank:Rank.Seven}, {suit:Suit.Heart, rank:Rank.Nine}])).toBe(0)
  })
  it('empty = 0', () => expect(calculateScore([])).toBe(0))
})

describe('getScoreCards', () => {
  it('filters score cards', () => {
    const cards = [{suit:Suit.Spade, rank:Rank.Five}, {suit:Suit.Heart, rank:Rank.Seven}, {suit:Suit.Club, rank:Rank.King}]
    expect(getScoreCards(cards).length).toBe(2)
  })
})

describe('needsBoxer', () => {
  it('returns score cards', () => {
    const cards = [{suit:Suit.Spade, rank:Rank.Five}, {suit:Suit.Heart, rank:Rank.Ten}, {suit:Suit.Club, rank:Rank.Seven}]
    expect(needsBoxer(cards).length).toBe(2)
  })
  it('empty when no score cards', () => {
    expect(needsBoxer([{suit:Suit.Spade, rank:Rank.Seven}, {suit:Suit.Heart, rank:Rank.Nine}]).length).toBe(0)
  })
})
