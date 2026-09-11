import { compareCards, getSmallestCard } from './compare'
import { identify, beats } from './judge'
import { BoxerMove } from './types'
import type { Card, Play } from './types'

export interface AiView {
  hand: Card[]
  currentBestPlay: Play | null
}

function groupByRank(hand: Card[]): Card[][] {
  const byRank = new Map<number, Card[]>()
  for (const card of hand) {
    const arr = byRank.get(card.rank) || []
    arr.push(card)
    byRank.set(card.rank, arr)
  }
  return [...byRank.values()]
}

/** Root candidates: two pairs + kicker, or triple + pair. */
function rootCombos(hand: Card[]): Card[][] {
  const groups = groupByRank(hand)
  const pairs = groups.filter(g => g.length >= 2)
  const combos: Card[][] = []
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const used = [pairs[i][0], pairs[i][1], pairs[j][0], pairs[j][1]]
      const kicker = hand.find(c => !used.some(u => u.suit === c.suit && u.rank === c.rank))
      if (kicker) combos.push([...used, kicker])
    }
  }
  const triple = groups.find(g => g.length >= 3)
  if (triple) {
    const otherPair = pairs.find(g => g[0].rank !== triple[0].rank)
    if (otherPair) combos.push([triple[0], triple[1], triple[2], otherPair[0], otherPair[1]])
  }
  return combos
}

/** All candidate combos worth trying when responding. */
function candidateCombos(hand: Card[]): Card[][] {
  const groups = groupByRank(hand)
  const singles = groups.map(g => [g[0]])
  const pairs = groups.filter(g => g.length >= 2).map(g => g.slice(0, 2))
  const triples = groups.filter(g => g.length >= 3).map(g => g.slice(0, 3))
  const bikes = pairs.flatMap(pair => {
    const single = hand.find(c => c.rank !== pair[0].rank)
    return single ? [[pair[0], pair[1], single]] : []
  })
  return [...singles, ...pairs, ...triples, ...bikes, ...rootCombos(hand)]
}

function highest(cards: Card[]): Card {
  return [...cards].sort((a, b) => compareCards(b, a))[0]
}

export function choosePlay(view: AiView): Card[] | null {
  const { hand, currentBestPlay } = view
  if (hand.length === 0) return null

  if (!currentBestPlay) {
    const all = identify(hand)
    if (all) return [...hand] // go out in one play
    return [getSmallestCard(hand)!]
  }

  const beating = candidateCombos(hand)
    .map(cards => ({ cards, play: identify(cards) }))
    .filter((x): x is { cards: Card[]; play: Play } => x.play !== null && beats(x.play, currentBestPlay))
    .sort((a, b) => {
      if (a.play.primaryRank !== b.play.primaryRank) return a.play.primaryRank - b.play.primaryRank
      return compareCards(highest(a.cards), highest(b.cards))
    })
  return beating.length > 0 ? beating[0].cards : null
}

export function chooseBoxerMove(rand: () => number = Math.random): BoxerMove {
  const moves = [BoxerMove.Rock, BoxerMove.Paper, BoxerMove.Scissors]
  return moves[Math.floor(rand() * moves.length)]
}

export function chooseSurrenderGive(hand: Card[]): Card {
  return hand.reduce((max, card) => (compareCards(card, max) > 0 ? card : max))
}

export function chooseSurrenderPick(cards: Card[]): Card {
  return cards.reduce((max, card) => (compareCards(card, max) > 0 ? card : max))
}

export function chooseSurrenderReturn(hand: Card[]): Card {
  return getSmallestCard(hand)!
}
