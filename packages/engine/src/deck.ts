import { Card, Suit, Rank } from './types'

/**
 * Create a deck. 1 deck (52 cards, no jokers) for < 4 players,
 * 2 decks (104 cards) for 4-6 players.
 */
export function createDeck(playerCount: number): Card[] {
  const deckCount = playerCount < 4 ? 1 : 2
  const cards: Card[] = []
  for (let d = 0; d < deckCount; d++) {
    for (let s = 0; s < 4; s++) {
      for (let r = 0; r < 13; r++) {
        cards.push({ suit: s as Suit, rank: r as Rank })
      }
    }
  }
  return cards
}

/**
 * Fisher-Yates shuffle. Returns new array, does not mutate input.
 */
export function shuffle(deck: Card[]): Card[] {
  const result = [...deck]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/**
 * Draw N cards from deck. Returns drawn cards and remaining deck.
 */
export function draw(deck: Card[], n: number): { drawn: Card[]; deck: Card[] } {
  const count = Math.min(n, deck.length)
  return {
    drawn: deck.slice(0, count),
    deck: deck.slice(count),
  }
}
