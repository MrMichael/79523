import { createDeck, shuffle, draw, identify, beats, calculateScore, compareCards, getSmallestCard, GamePhase, isScoreCard, Rank } from '@79523/engine'
import type { Card } from '@79523/engine'
import type { ServerGame, GamePlayer } from './types'

/**
 * Initialise a game state.
 * @param leadPlayerId  Explicit first player (subsequent games use the surrender result).
 * @param isFirstGame   Only the session's first game enforces the "first play must include
 *                      your smallest card" rule (Design §4.1). Later games' first trick is
 *                      led by the surrender loser with any hand type.
 */
export function initGame(playerIds: string[], leadPlayerId?: string, isFirstGame = true): ServerGame {
  const deck = shuffle(createDeck(playerIds.length))
  const players: GamePlayer[] = playerIds.map(id => ({
    id, hand: [], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false, boxerWins: 0, tiebreakOrder: 0,
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
    isFirstTrick: isFirstGame,
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

  // Remove exactly one physical card per played card (2 decks → suit+rank may repeat).
  for (const pc of playerCards) {
    player.hand = removeCardFromHand(player.hand, pc)
  }

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

  // Count active players BEFORE marking current player as finished
  // Ensures trailing players still get their turn (Design §4.6)
  const activePlayersBefore = game.players.filter(p => !p.finished).length
  // Only mark finished when deck is also empty — player can draw new cards otherwise (Design §4.4)
  if (player.hand.length === 0 && game.deck.length === 0) player.finished = true
  const activePlayers = Math.max(activePlayersBefore, game.players.filter(p => !p.finished).length)
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
  // Count bestPlayer even if they just finished (last card) so trailing players get their turn
  const activePlayers = game.players.filter(p => !p.finished || p.id === game.bestPlayerId).length

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

/** Verify total score at game end: played + boxer should = 100/200 */
export function verifyScoreTotal(game: ServerGame): {
  expected: number
  played: number
  inHands: number
  inDeck: number
  total: number
  missing: number
  details: string
} {
  const expected = game.players.length < 4 ? 100 : 200
  const played = game.players.reduce((sum, p) => sum + p.score, 0)
  const inHands = game.players.reduce((sum, p) => sum + calculateScore(p.hand), 0)
  const inDeck = calculateScore(game.deck)
  const total = played + inHands + inDeck
  const missing = expected - total

  // Count per rank
  const allCards = [...game.deck]
  for (const p of game.players) allCards.push(...p.hand)
  const fiveCount = allCards.filter(c => isScoreCard(c) && c.rank === Rank.Five).length
  const tenCount = allCards.filter(c => isScoreCard(c) && c.rank === Rank.Ten).length
  const kingCount = allCards.filter(c => isScoreCard(c) && c.rank === Rank.King).length

  return {
    expected, played, inHands, inDeck, total, missing,
    details: `5s:${fiveCount}/4 10s:${tenCount}/4 Ks:${kingCount}/4 score=${played}+${inHands}+${inDeck}=${total}/${expected} (missing ${missing})`,
  }
}

/** Group players by score, return only tied groups (≥2 players), sorted descending */
export function getScoreTieGroups(game: ServerGame): { score: number; playerIds: string[] }[] {
  const byScore = new Map<number, string[]>()
  for (const p of game.players) {
    const ids = byScore.get(p.score) || []
    ids.push(p.id)
    byScore.set(p.score, ids)
  }
  return Array.from(byScore.entries())
    .filter(([, ids]) => ids.length > 1)
    .sort(([a], [b]) => b - a)
    .map(([score, ids]) => ({ score, playerIds: ids }))
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
      // Winner has no card to give back — undo the give (return loser's card)
      winner.hand = removeCardFromHand(winner.hand, loserCard)
      loser.hand.push(loserCard)
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
  const loserCards = bottomTwo
    .flatMap(l => {
      const card = getLargestSingle(l.hand)
      return card ? [{ player: l, card }] : []
    })
    .sort((a, b) => compareCards(b.card, a.card))

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

/**
 * Remove a player who left (e.g. disconnected and was kicked) from an in-progress game.
 *
 * Keeps `game.players` the single source of truth so downstream logic (turn rotation,
 * scoring, boxer) never has to look a departed player up again. If the departed player was
 * the current player or the trick leader, the trick is reset and `needsResume` is returned
 * so the caller can hand the turn to the next player. The table pot is intentionally kept so
 * score cards already played are not lost — the next trick winner collects it.
 *
 * @returns `needsResume` — caller should start a fresh turn for `game.currentPlayerIndex`.
 */
export function removeGamePlayer(game: ServerGame, playerId: string): { removed: boolean; needsResume: boolean } {
  const idx = game.players.findIndex(p => p.id === playerId)
  if (idx === -1) return { removed: false, needsResume: false }

  const wasCurrent = idx === game.currentPlayerIndex
  const wasBest = game.bestPlayerId === playerId

  game.roundParticipants.delete(playerId)
  game.players.splice(idx, 1)

  // Splice shifts later indices down by one.
  if (idx < game.currentPlayerIndex) game.currentPlayerIndex--
  if (game.players.length === 0) {
    game.currentPlayerIndex = 0
    return { removed: true, needsResume: false }
  }
  game.currentPlayerIndex = Math.max(0, Math.min(game.currentPlayerIndex, game.players.length - 1))

  // The winning play walked off the table — clear the trick so the next player can lead.
  if (wasBest) {
    game.currentBestPlay = null
    game.bestPlayerId = null
    game.passCount = 0
  }

  // Boxer: drop the seat from the in-flight round; the caller decides whether to advance it.
  if (game.boxerState) {
    const bs = game.boxerState
    bs.currentSurvivors = bs.currentSurvivors.filter(id => id !== playerId)
    bs.currentMoves.delete(playerId)
    return { removed: true, needsResume: false }
  }

  // Skip finished seats for the resumed turn.
  let guard = 0
  while (game.players[game.currentPlayerIndex]?.finished && guard++ < game.players.length) {
    game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length
  }

  return { removed: true, needsResume: wasCurrent || wasBest }
}
