import { createDeck, shuffle, draw, identify, beats, calculateScore, compareCards, getSmallestCard, GamePhase } from '@79523/engine'
import type { Card } from '@79523/engine'
import type { ServerGame, GamePlayer } from './types'

export function initGame(playerIds: string[]): ServerGame {
  const deck = shuffle(createDeck(playerIds.length))
  const players: GamePlayer[] = playerIds.map(id => ({
    id, hand: [], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false,
  }))
  for (const player of players) {
    const { drawn, deck: remaining } = draw(deck, 5)
    player.hand = drawn
    deck.length = 0; deck.push(...remaining)
  }
  return {
    phase: GamePhase.Playing,
    deck: structuredClone(deck.map(c => ({ ...c }))),
    players,
    currentPlayerIndex: 0,
    currentBestPlay: null,
    bestPlayerId: null,
    passCount: 0,
    tableCards: [],
    gameOver: false,
    roundParticipants: new Set(),
  }
}

export function findLeadPlayer(game: ServerGame): string {
  let smallestCard: Card | null = null
  let smallestPlayerId = ''
  for (const player of game.players) {
    const minCard = getSmallestCard(player.hand)
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
    return { success: false, error: 'Cards do not beat the current play' }
  }

  player.hand = player.hand.filter(c => !playerCards.some(pc => pc.suit === c.suit && pc.rank === c.rank))
  if (player.hand.length === 0) player.finished = true

  game.tableCards.push(...playerCards)
  game.currentBestPlay = { type: play.type, cards: playerCards, primaryRank: play.primaryRank }
  game.bestPlayerId = playerId
  game.roundParticipants.add(playerId)

  const activePlayers = game.players.filter(p => !p.finished).length
  if (game.passCount >= activePlayers - 1) {
    if (game.bestPlayerId) {
      const winner = game.players.find(p => p.id === game.bestPlayerId)!
      winner.score += calculateScore(game.tableCards)
    }
    const roundWinnerId = game.bestPlayerId
    game.currentBestPlay = null; game.bestPlayerId = null; game.passCount = 0
    const someoneFinished = game.players.some(p => p.finished)

    // Draw cards for round participants
    for (const pid of game.roundParticipants) {
      const p = game.players.find(pl => pl.id === pid)
      if (p && !p.finished && p.hand.length < 5) {
        const toDraw = 5 - p.hand.length
        const { drawn, deck: remaining } = draw(game.deck, toDraw)
        p.hand.push(...drawn)
        game.deck = remaining
      }
    }
    game.roundParticipants.clear()

    if (game.deck.length === 0 && someoneFinished) {
      game.gameOver = true
      game.phase = GamePhase.Settling
      return { success: true, roundWinner: roundWinnerId, gameOver: true }
    }

    return { success: true, roundWinner: roundWinnerId }
  }

  return { success: true }
}

export function handlePass(game: ServerGame, playerId: string): { success: boolean; error?: string; roundOver?: boolean; roundWinner?: string } {
  game.passCount++
  const activePlayers = game.players.filter(p => !p.finished).length

  if (game.passCount >= activePlayers - 1 && game.bestPlayerId) {
    const winner = game.players.find(p => p.id === game.bestPlayerId)!
    winner.score += calculateScore(game.tableCards)

    const roundWinnerId = game.bestPlayerId
    game.currentBestPlay = null; game.bestPlayerId = null; game.passCount = 0

    for (const pid of game.roundParticipants) {
      const p = game.players.find(pl => pl.id === pid)
      if (p && !p.finished && p.hand.length < 5) {
        const toDraw = 5 - p.hand.length
        const { drawn, deck: remaining } = draw(game.deck, toDraw)
        p.hand.push(...drawn)
        game.deck = remaining
      }
    }
    game.roundParticipants.clear()

    const someoneFinished = game.players.some(p => p.finished)
    if (game.deck.length === 0 && someoneFinished) {
      game.gameOver = true
      game.phase = GamePhase.Settling
      return { success: true, roundOver: true, roundWinner: roundWinnerId }
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

export function getLargestSingle(hand: Card[]): Card {
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
