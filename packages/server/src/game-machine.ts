import { createDeck, shuffle, draw, identify, beats, calculateScore, compareCards, getSmallestCard, GamePhase, isScoreCard } from '@79523/engine'
import type { Card } from '@79523/engine'
import type { ServerGame, GamePlayer } from './types'

export function initGame(playerIds: string[], leadPlayerId?: string): ServerGame {
  const deck = shuffle(createDeck(playerIds.length))
  const players: GamePlayer[] = playerIds.map(id => ({
    id, hand: [], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false,
  }))
  for (const player of players) {
    const { drawn, deck: remaining } = draw(deck, 5)
    player.hand = drawn
    deck.length = 0; deck.push(...remaining)
  }
  // First game: find smallest card holder. Subsequent games: use surrender swap result (Design §4.2)
  const leadId = leadPlayerId || findLeadPlayerId(players)
  return {
    phase: GamePhase.Playing,
    deck: structuredClone(deck.map(c => ({ ...c }))),
    players,
    currentPlayerIndex: players.findIndex(p => p.id === leadId),
    currentBestPlay: null,
    bestPlayerId: null,
    passCount: 0,
    tableCards: [],
    gameOver: false,
    roundParticipants: new Set(),
    isFirstTrick: true,
    boxerState: null,
  }
}

function findLeadPlayerId(players: GamePlayer[]): string {
  let smallestCard: Card | null = null
  let smallestPlayerId = ''
  for (const player of players) {
    const minCard = getSmallestCard(player.hand)
    if (!minCard) continue
    if (!smallestCard || compareCards(minCard, smallestCard) < 0) {
      smallestCard = minCard
      smallestPlayerId = player.id
    }
  }
  return smallestPlayerId
}

export function handlePlay(
  game: ServerGame, playerId: string, playerCards: Card[]
): { success: boolean; error?: string; roundWinner?: string; gameOver?: boolean } {
  const player = game.players.find(p => p.id === playerId)
  if (!player) return { success: false, error: 'Player not found' }

  const play = identify(playerCards)
  if (!play) return { success: false, error: 'Invalid card combination' }

  if (game.currentBestPlay && !beats(play, game.currentBestPlay)) {
    return { success: false, error: '出牌过小' }
  }

  // First trick of the game: lead player must include their smallest card (Design §4.1)
  if (game.isFirstTrick && !game.currentBestPlay) {
    const smallest = getSmallestCard(player.hand)
    if (!smallest) return { success: false, error: 'No cards in hand' }
    const includesSmallest = playerCards.some(
      pc => pc.suit === smallest.suit && pc.rank === smallest.rank
    )
    if (!includesSmallest) {
      return { success: false, error: 'First play must include your smallest card' }
    }
    game.isFirstTrick = false
  }

  player.hand = player.hand.filter(c => !playerCards.some(pc => pc.suit === c.suit && pc.rank === c.rank))
  // Only mark finished when deck is also empty — player can draw new cards otherwise (Design §4.4)
  if (player.hand.length === 0 && game.deck.length === 0) player.finished = true

  const wasBeating = game.bestPlayerId !== null

  game.tableCards.push(...playerCards)
  game.currentBestPlay = { type: play.type, cards: playerCards, primaryRank: play.primaryRank }
  game.bestPlayerId = playerId
  game.roundParticipants.add(playerId)

  // Reset passCount when beating current best play — players who passed
  // get new chances to play (Design §4.5 Case 1/3)
  if (wasBeating) {
    game.passCount = 0
  }

  const activePlayers = game.players.filter(p => !p.finished).length
  if (game.passCount >= activePlayers - 1) {
    if (game.bestPlayerId) {
      const winner = game.players.find(p => p.id === game.bestPlayerId)!
      winner.score += calculateScore(game.tableCards)
    }
    const roundWinnerId = game.bestPlayerId
    game.currentBestPlay = null; game.bestPlayerId = null; game.passCount = 0
    const someoneFinished = game.players.some(p => p.finished)

    // Draw cards: winner first, then others in play order (Design §4.7)
    if (roundWinnerId) {
      const winner = game.players.find(p => p.id === roundWinnerId)
      if (winner && !winner.finished && winner.hand.length < 5) {
        const toDraw = 5 - winner.hand.length
        const { drawn, deck: remaining } = draw(game.deck, toDraw)
        winner.hand.push(...drawn)
        game.deck = remaining
      }
    }
    for (const pid of game.roundParticipants) {
      if (pid === roundWinnerId) continue
      const p = game.players.find(pl => pl.id === pid)
      if (p && !p.finished && p.hand.length < 5) {
        const toDraw = 5 - p.hand.length
        const { drawn, deck: remaining } = draw(game.deck, toDraw)
        p.hand.push(...drawn)
        game.deck = remaining
      }
    }
    game.roundParticipants.clear()
    const allFinished = game.players.every(p => p.finished)

    if ((game.deck.length === 0 && someoneFinished) || allFinished) {
      game.gameOver = true
      game.phase = GamePhase.Settling
      return { success: true, roundWinner: roundWinnerId, gameOver: true }
    }

    return { success: true, roundWinner: roundWinnerId }
  }

  return { success: true }
}

export function handlePass(game: ServerGame, playerId: string): { success: boolean; error?: string; roundOver?: boolean; roundWinner?: string; gameOver?: boolean; forcePlay?: boolean } {
  if (!game.bestPlayerId) return { success: false, error: 'Must play when table is empty' }

  // In last round (deck empty), bestPlayer cannot pass — they must play (Design §4.8 Case 2)
  if (game.deck.length === 0 && playerId === game.bestPlayerId) {
    return { success: false, error: 'Must play in final round — cannot pass as current leader' }
  }

  game.passCount++
  const activePlayers = game.players.filter(p => !p.finished).length

  if (game.passCount >= activePlayers - 1 && game.bestPlayerId) {
    // In last round with no one finished, force bestPlayer to play again (Design §4.8 Case 2/3)
    const someoneFinished = game.players.some(p => p.finished)
    if (game.deck.length === 0 && !someoneFinished) {
      game.passCount = 0
      game.currentBestPlay = null // Allow bestPlayer to start a new trick (any valid hand)
      return { success: true, forcePlay: true }
    }
    const winner = game.players.find(p => p.id === game.bestPlayerId)!
    winner.score += calculateScore(game.tableCards)

    const roundWinnerId = game.bestPlayerId
    game.currentBestPlay = null; game.bestPlayerId = null; game.passCount = 0

    // Draw cards: winner first, then others in play order (Design §4.7)
    if (roundWinnerId) {
      const winner = game.players.find(p => p.id === roundWinnerId)
      if (winner && !winner.finished && winner.hand.length < 5) {
        const toDraw = 5 - winner.hand.length
        const { drawn, deck: remaining } = draw(game.deck, toDraw)
        winner.hand.push(...drawn)
        game.deck = remaining
      }
    }
    for (const pid of game.roundParticipants) {
      if (pid === roundWinnerId) continue
      const p = game.players.find(pl => pl.id === pid)
      if (p && !p.finished && p.hand.length < 5) {
        const toDraw = 5 - p.hand.length
        const { drawn, deck: remaining } = draw(game.deck, toDraw)
        p.hand.push(...drawn)
        game.deck = remaining
      }
    }
    game.roundParticipants.clear()
    const allFinished = game.players.every(p => p.finished)
    if ((game.deck.length === 0 && someoneFinished) || allFinished) {
      game.gameOver = true
      game.phase = GamePhase.Settling
      return { success: true, roundOver: true, roundWinner: roundWinnerId, gameOver: true }
    }
    return { success: true, roundOver: true, roundWinner: roundWinnerId }
  }
  return { success: true }
}

export function settleGame(game: ServerGame): { scores: { id: string; totalScore: number }[]; topTwo: string[]; bottomTwo: string[] } {
  const sorted = [...game.players].sort((a, b) => b.score - a.score)
  return {
    scores: sorted.map(p => ({ id: p.id, totalScore: p.score })),
    topTwo: sorted.slice(0, 2).map(p => p.id),
    bottomTwo: sorted.slice(-2).map(p => p.id),
  }
}

export function getLargestSingle(hand: Card[]): Card | null {
  if (hand.length === 0) return null
  return hand.reduce((max, card) => compareCards(card, max) > 0 ? card : max)
}

export function removeCardFromHand(hand: Card[], card: Card): Card[] {
  const idx = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank)
  if (idx >= 0) return [...hand.slice(0, idx), ...hand.slice(idx + 1)]
  return hand
}

export function determineNextLead(surrenderedCards: { playerId: string; card: Card }[]): string {
  return surrenderedCards.reduce((best, curr) => compareCards(curr.card, best.card) > 0 ? curr : best).playerId
}

/** Collect unplayed score cards from deck + unfinished players' hands — Design §4 拳王 */
export function getBoxerScoreCards(game: ServerGame): Card[] {
  const cards: Card[] = []
  // Score cards still in deck
  cards.push(...game.deck.filter(c => isScoreCard(c)))
  // Score cards in unfinished players' hands
  for (const p of game.players) {
    if (!p.finished) {
      cards.push(...p.hand.filter(c => isScoreCard(c)))
    }
  }
  return cards
}

/** All non-finished players who should participate in boxer rounds */
export function getBoxerParticipants(game: ServerGame): string[] {
  return game.players.map(p => p.id)
}

/** Execute surrender swap: bottom 2 give largest single to top 2, top 2 give one back (Design §4 上缴+换牌) */
export function executeSurrenderSwap(game: ServerGame): {
  swaps: { loserId: string; winnerId: string; gaveUpCard: Card; receivedCard: Card }[]
  nextLeadPlayerId: string
} {
  const sorted = [...game.players].sort((a, b) => b.score - a.score)
  const playerCount = game.players.length

  // <4 players: 1v1 swap
  if (playerCount < 4) {
    const winner = sorted[0]
    const loser = sorted[sorted.length - 1]
    const loserCard = getLargestSingle(loser.hand)
    if (!loserCard) {
      // Loser has no cards (finished with empty hand) — swap is a no-op
      return { swaps: [], nextLeadPlayerId: loser.id }
    }
    loser.hand = removeCardFromHand(loser.hand, loserCard)
    winner.hand.push(loserCard)
    const winnerCard = getSmallestCard(winner.hand.filter(c => c.rank !== loserCard.rank || c.suit !== loserCard.suit))
    if (!winnerCard) {
      return { swaps: [], nextLeadPlayerId: loser.id }
    }
    winner.hand = removeCardFromHand(winner.hand, winnerCard)
    loser.hand.push(winnerCard)
    return {
      swaps: [{ loserId: loser.id, winnerId: winner.id, gaveUpCard: loserCard, receivedCard: winnerCard }],
      nextLeadPlayerId: determineNextLead([{ playerId: loser.id, card: loserCard }]),
    }
  }

  // 4+ players: top 2 winners, bottom 2 losers
  const topTwo = sorted.slice(0, 2)
  const bottomTwo = sorted.slice(-2)

  interface SwapResult { loserId: string; winnerId: string; gaveUpCard: Card; receivedCard: Card }
  const swaps: SwapResult[] = []
  const surrenderedCards: { playerId: string; card: Card }[] = []

  // Sort losers by their largest single (bigger card goes to 1st winner)
  // Skip losers with empty hands (finished players)
  const loserCards = bottomTwo.map(l => ({ player: l, card: getLargestSingle(l.hand) }))
    .filter(e => e.card !== null)
    .sort((a, b) => compareCards(b.card!, a.card!))

  for (let i = 0; i < loserCards.length; i++) {
    const { player: loser, card: gaveUpCard } = loserCards[i]
    const winner = topTwo[i]
    loser.hand = removeCardFromHand(loser.hand, gaveUpCard)
    winner.hand.push(gaveUpCard)
    const winnerCard = getSmallestCard(winner.hand.filter(c => c.rank !== gaveUpCard.rank || c.suit !== gaveUpCard.suit))
    if (winnerCard) {
      winner.hand = removeCardFromHand(winner.hand, winnerCard)
      loser.hand.push(winnerCard)
      swaps.push({ loserId: loser.id, winnerId: winner.id, gaveUpCard, receivedCard: winnerCard })
    }
    surrenderedCards.push({ playerId: loser.id, card: gaveUpCard })
  }

  const nextLeadPlayerId = determineNextLead(surrenderedCards)
  return { swaps, nextLeadPlayerId }
}
