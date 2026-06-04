import { describe, it, expect } from 'vitest'
import { compareCards, getSmallestCard } from '../compare'
import { Suit, Rank } from '../types'

describe('compareCards', () => {
  it('higher rank wins', () => {
    expect(compareCards({suit:Suit.Diamond, rank:Rank.Seven}, {suit:Suit.Spade, rank:Rank.Four})).toBeGreaterThan(0)
  })
  it('same rank: Spade beats Heart', () => {
    expect(compareCards({suit:Suit.Spade, rank:Rank.Ace}, {suit:Suit.Heart, rank:Rank.Ace})).toBeGreaterThan(0)
  })
  it('same rank: Heart beats Club', () => {
    expect(compareCards({suit:Suit.Heart, rank:Rank.King}, {suit:Suit.Club, rank:Rank.King})).toBeGreaterThan(0)
  })
  it('same rank: Club beats Diamond', () => {
    expect(compareCards({suit:Suit.Club, rank:Rank.Queen}, {suit:Suit.Diamond, rank:Rank.Queen})).toBeGreaterThan(0)
  })
  it('same suit and rank returns 0', () => {
    expect(compareCards({suit:Suit.Spade, rank:Rank.Ten}, {suit:Suit.Spade, rank:Rank.Ten})).toBe(0)
  })
  it('Seven beats Nine', () => {
    expect(compareCards({suit:Suit.Club, rank:Rank.Seven}, {suit:Suit.Spade,rank:Rank.Nine})).toBeGreaterThan(0)
  })
  it('Nine beats Five', () => {
    expect(compareCards({suit:Suit.Club, rank:Rank.Nine}, {suit:Suit.Spade,rank:Rank.Five})).toBeGreaterThan(0)
  })
  it('Five beats Two', () => {
    expect(compareCards({suit:Suit.Club, rank:Rank.Five}, {suit:Suit.Spade,rank:Rank.Two})).toBeGreaterThan(0)
  })
})

describe('getSmallestCard', () => {
  it('returns lowest rank', () => {
    const cards = [{suit:Suit.Spade, rank:Rank.Seven}, {suit:Suit.Heart, rank:Rank.Four}, {suit:Suit.Club, rank:Rank.Nine}]
    expect(getSmallestCard(cards).rank).toBe(Rank.Four)
  })
  it('same rank returns lower suit', () => {
    const cards = [{suit:Suit.Spade, rank:Rank.Ace}, {suit:Suit.Diamond, rank:Rank.Ace}]
    expect(getSmallestCard(cards).suit).toBe(Suit.Diamond)
  })
  it('single card returns that card', () => {
    const cards = [{suit:Suit.Heart, rank:Rank.Ten}]
    expect(getSmallestCard(cards).rank).toBe(Rank.Ten)
  })
})
