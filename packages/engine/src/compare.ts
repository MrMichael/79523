import type { Card } from './types'

export function compareCards(a: Card, b: Card): number {
  if (a.rank !== b.rank) return a.rank - b.rank
  return b.suit - a.suit  // lower suit = stronger
}

export function getSmallestCard(cards: Card[]): Card | null {
  if (cards.length === 0) return null
  return cards.reduce((min, card) => compareCards(card, min) < 0 ? card : min)
}
