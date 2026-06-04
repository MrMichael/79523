import type { Card } from './types'
import { Rank } from './types'

export function isScoreCard(card: Card): boolean {
  return card.rank === Rank.Five || card.rank === Rank.Ten || card.rank === Rank.King
}

export function calculateScore(cards: Card[]): number {
  return cards.reduce((sum, card) => {
    if (card.rank === Rank.Five) return sum + 5
    if (card.rank === Rank.Ten || card.rank === Rank.King) return sum + 10
    return sum
  }, 0)
}

export function getScoreCards(cards: Card[]): Card[] {
  return cards.filter(isScoreCard)
}

export function needsBoxer(cards: Card[]): Card[] {
  return getScoreCards(cards)
}
