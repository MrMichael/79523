import type { Card, Play } from './types'
import { HandType } from './types'
import { compareCards } from './compare'

export function identify(cards: Card[]): Play | null {
  if (cards.length === 0) return null

  const groups = new Map<number, Card[]>()
  for (const card of cards) {
    const existing = groups.get(card.rank) || []
    existing.push(card)
    groups.set(card.rank, existing)
  }

  const groupSizes = Array.from(groups.entries())
    .map(([rank, cs]) => ({ rank, count: cs.length, cards: cs }))
    .sort((a, b) => b.count - a.count || b.rank - a.rank)

  if (cards.length === 1) {
    return { type: HandType.Single, cards: [...cards], primaryRank: cards[0].rank }
  }

  if (cards.length === 2) {
    if (groupSizes.length === 1 && groupSizes[0].count === 2) {
      return { type: HandType.Pair, cards: [...cards], primaryRank: groupSizes[0].rank }
    }
    return null
  }

  if (cards.length === 3) {
    if (groupSizes.length === 1 && groupSizes[0].count === 3) {
      return { type: HandType.Triple, cards: [...cards], primaryRank: groupSizes[0].rank }
    }
    if (groupSizes.length === 2 && groupSizes[0].count === 2 && groupSizes[1].count === 1) {
      return { type: HandType.Bike, cards: [...cards], primaryRank: groupSizes[0].rank, secondaryRank: groupSizes[1].rank }
    }
    return null
  }

  // 4-card hands — two pairs (2+2)
  if (cards.length === 4) {
    if (groupSizes.length === 2 && groupSizes[0].count === 2 && groupSizes[1].count === 2) {
      const biggerPair = Math.max(groupSizes[0].rank, groupSizes[1].rank)
      const smallerPair = Math.min(groupSizes[0].rank, groupSizes[1].rank)
      return { type: HandType.Root, cards: [...cards], primaryRank: biggerPair, secondaryRank: smallerPair }
    }
    return null
  }

  // 5-card hands — two pairs + single (2+2+1) or triple + pair (3+2)
  if (cards.length === 5) {
    // Two pairs + single (existing Root)
    if (groupSizes.length === 3 && groupSizes[0].count === 2 && groupSizes[1].count === 2 && groupSizes[2].count === 1) {
      const biggerPair = Math.max(groupSizes[0].rank, groupSizes[1].rank)
      const smallerPair = Math.min(groupSizes[0].rank, groupSizes[1].rank)
      return { type: HandType.Root, cards: [...cards], primaryRank: biggerPair, secondaryRank: smallerPair }
    }
    // Triple + pair (full house → Root)
    if (groupSizes.length === 2 && groupSizes[0].count === 3 && groupSizes[1].count === 2) {
      return { type: HandType.Root, cards: [...cards], primaryRank: groupSizes[0].rank, secondaryRank: groupSizes[1].rank }
    }
    return null
  }

  return null
}

export function beats(newPlay: Play, currentBest: Play): boolean {
  if (newPlay.type !== currentBest.type) return false

  if (newPlay.primaryRank !== currentBest.primaryRank) {
    return newPlay.primaryRank > currentBest.primaryRank
  }

  if (newPlay.secondaryRank !== undefined && currentBest.secondaryRank !== undefined) {
    if (newPlay.secondaryRank !== currentBest.secondaryRank) {
      return newPlay.secondaryRank > currentBest.secondaryRank
    }
  }

  const newHighest = [...newPlay.cards].sort((a, b) => compareCards(b, a))[0]
  const bestHighest = [...currentBest.cards].sort((a, b) => compareCards(b, a))[0]
  return compareCards(newHighest, bestHighest) > 0
}
