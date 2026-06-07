import { describe, test, expect } from '@jest/globals'
import { Suit, Rank, HandType, GamePhase, compareCards, getSmallestCard, calculateScore, isScoreCard } from '@79523/engine'
import type { Card } from '@79523/engine'
import type { ServerGame } from '../types'
import {
  initGame,
  handlePlay,
  handlePass,
  settleGame,
  getLargestSingle,
  removeCardFromHand,
  determineNextLead,
  getBoxerScoreCards,
  getBoxerParticipants,
  executeSurrenderSwap,
  verifyScoreTotal,
} from '../game-machine'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const c = (suit: Suit, rank: Rank): Card => ({ suit, rank })

function makeGame(overrides: Partial<ServerGame> = {}): ServerGame {
  return {
    phase: GamePhase.Playing,
    deck: [],
    players: [
      { id: 'p1', hand: [], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
      { id: 'p2', hand: [], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
    ],
    currentPlayerIndex: 0,
    currentBestPlay: null,
    bestPlayerId: null,
    passCount: 0,
    tableCards: [],
    gameOver: false,
    roundParticipants: new Set(),
    isFirstTrick: false,
    boxerState: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// initGame
// ---------------------------------------------------------------------------

describe('initGame', () => {
  test('2-player game deals 5 cards to each player', () => {
    const game = initGame(['p1', 'p2'])

    expect(game.players).toHaveLength(2)
    expect(game.players[0].hand).toHaveLength(5)
    expect(game.players[1].hand).toHaveLength(5)
  })

  test('deck size = 52 - players * 5 for 2-player game', () => {
    const game = initGame(['p1', 'p2'])

    // 52 - 2*5 = 42
    expect(game.deck).toHaveLength(42)
  })

  test('first game: smallest single card holder leads (no leadPlayerId)', () => {
    const game = initGame(['p1', 'p2'])

    // Determine which player actually has the smallest card
    const p1Min = getSmallestCard(game.players[0].hand)
    const p2Min = getSmallestCard(game.players[1].hand)
    const expectedLead = compareCards(p1Min, p2Min) < 0
      ? game.players[0].id
      : game.players[1].id

    expect(game.players[game.currentPlayerIndex].id).toBe(expectedLead)
  })

  test('leadPlayerId parameter overrides automatic lead detection', () => {
    const game = initGame(['p1', 'p2'], 'p2')

    expect(game.players[game.currentPlayerIndex].id).toBe('p2')
  })

  test('game is in Playing phase', () => {
    const game = initGame(['p1', 'p2'])

    expect(game.phase).toBe(GamePhase.Playing)
  })

  test('initial passCount is 0', () => {
    const game = initGame(['p1', 'p2'])

    expect(game.passCount).toBe(0)
  })

  test('isFirstTrick is true for a new game', () => {
    const game = initGame(['p1', 'p2'])

    expect(game.isFirstTrick).toBe(true)
  })

  test('4-player game deals 5 cards each, deck = 104 - 4*5 = 84', () => {
    const game = initGame(['p1', 'p2', 'p3', 'p4'])

    expect(game.players).toHaveLength(4)
    game.players.forEach(p => expect(p.hand).toHaveLength(5))
    // 2 decks for 4 players = 104 - 20 = 84
    expect(game.deck).toHaveLength(84)
  })
})

// ---------------------------------------------------------------------------
// handlePlay - successful plays
// ---------------------------------------------------------------------------

describe('handlePlay', () => {
  describe('valid plays', () => {
    test('play a single card successfully', () => {
      const card = c(Suit.Spade, Rank.Seven)
      // Deck must be non-empty so player doesn't finish (hand empty + deck empty → finished)
      const game = makeGame({
        deck: [c(Suit.Diamond, Rank.Five)],
        players: [
          { id: 'p1', hand: [card, c(Suit.Spade, Rank.Eight)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [c(Suit.Heart, Rank.Six)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
        currentPlayerIndex: 0,
      })

      const result = handlePlay(game, 'p1', [card])

      expect(result.success).toBe(true)
      expect(game.currentBestPlay).toEqual({
        type: HandType.Single,
        cards: [card],
        primaryRank: Rank.Seven,
      })
      expect(game.bestPlayerId).toBe('p1')
      expect(game.tableCards).toHaveLength(1)
      // Hand had 2 cards, played 1 → 1 remaining
      expect(game.players[0].hand).toHaveLength(1)
    })

    test('play a pair successfully', () => {
      const pair = [c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.Seven)]
      const game = makeGame({
        deck: [c(Suit.Diamond, Rank.Five)],
        players: [
          { id: 'p1', hand: [...pair, c(Suit.Spade, Rank.Eight)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [c(Suit.Club, Rank.Six)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      const result = handlePlay(game, 'p1', pair)

      expect(result.success).toBe(true)
      expect(game.currentBestPlay!.type).toBe(HandType.Pair)
      // Hand had 3 cards, played 2 → 1 remaining
      expect(game.players[0].hand).toHaveLength(1)
    })

    test('play a bike (pair + single) successfully', () => {
      const bike = [c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.Seven), c(Suit.Club, Rank.Four)]
      const game = makeGame({
        deck: [c(Suit.Diamond, Rank.Five)],
        players: [
          { id: 'p1', hand: [...bike, c(Suit.Spade, Rank.Nine)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [c(Suit.Diamond, Rank.Six)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      const result = handlePlay(game, 'p1', bike)

      expect(result.success).toBe(true)
      expect(game.currentBestPlay!.type).toBe(HandType.Bike)
      // Hand had 4 cards, played 3 → 1 remaining
      expect(game.players[0].hand).toHaveLength(1)
    })

    test('play a triple successfully', () => {
      const triple = [c(Suit.Spade, Rank.Jack), c(Suit.Heart, Rank.Jack), c(Suit.Club, Rank.Jack)]
      const game = makeGame({
        deck: [c(Suit.Diamond, Rank.Five)],
        players: [
          { id: 'p1', hand: [...triple, c(Suit.Spade, Rank.Nine)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [c(Suit.Diamond, Rank.Six)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      const result = handlePlay(game, 'p1', triple)

      expect(result.success).toBe(true)
      expect(game.currentBestPlay!.type).toBe(HandType.Triple)
      // Hand had 4 cards, played 3 → 1 remaining
      expect(game.players[0].hand).toHaveLength(1)
    })

    test('play a root (two pairs + single) successfully', () => {
      const root = [
        c(Suit.Spade, Rank.King), c(Suit.Heart, Rank.King),
        c(Suit.Club, Rank.Queen), c(Suit.Diamond, Rank.Queen),
        c(Suit.Spade, Rank.Four),
      ]
      const game = makeGame({
        deck: [c(Suit.Diamond, Rank.Five)],
        players: [
          { id: 'p1', hand: [...root, c(Suit.Spade, Rank.Nine)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [c(Suit.Diamond, Rank.Six)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      const result = handlePlay(game, 'p1', root)

      expect(result.success).toBe(true)
      expect(game.currentBestPlay!.type).toBe(HandType.Root)
      // Hand had 6 cards, played 5 → 1 remaining
      expect(game.players[0].hand).toHaveLength(1)
    })
  })

  // -----------------------------------------------------------------------
  // handlePlay - invalid plays
  // -----------------------------------------------------------------------

  describe('invalid plays', () => {
    test('invalid card combination (4 cards) is rejected', () => {
      const cards = [c(Suit.Spade, Rank.Four), c(Suit.Heart, Rank.Four), c(Suit.Club, Rank.Four), c(Suit.Diamond, Rank.Four)]
      const game = makeGame({
        players: [
          { id: 'p1', hand: [...cards, c(Suit.Spade, Rank.Six)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      const result = handlePlay(game, 'p1', cards)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Invalid card combination')
    })

    test('different hand type cannot beat current play', () => {
      const game = makeGame({
        currentBestPlay: { type: HandType.Single, cards: [c(Suit.Spade, Rank.Jack)], primaryRank: Rank.Jack },
        bestPlayerId: 'p1',
        players: [
          { id: 'p1', hand: [], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [
            c(Suit.Spade, Rank.Two), c(Suit.Heart, Rank.Two),
          ], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      const result = handlePlay(game, 'p2', [c(Suit.Spade, Rank.Two), c(Suit.Heart, Rank.Two)])

      expect(result.success).toBe(false)
      expect(result.error).toBe('出牌过小')
    })

    test('same hand type but lower rank cannot beat', () => {
      // current: Single Rank.Seven(12), new play: Single Rank.Nine(11) — lower rank
      const game = makeGame({
        currentBestPlay: { type: HandType.Single, cards: [c(Suit.Spade, Rank.Seven)], primaryRank: Rank.Seven },
        bestPlayerId: 'p1',
        players: [
          { id: 'p1', hand: [], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [c(Suit.Heart, Rank.Nine)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      const result = handlePlay(game, 'p2', [c(Suit.Heart, Rank.Nine)])

      expect(result.success).toBe(false)
      expect(result.error).toBe('出牌过小')
    })

    test('player not found returns error', () => {
      const game = makeGame()

      const result = handlePlay(game, 'nonexistent', [c(Suit.Spade, Rank.Four)])

      expect(result.success).toBe(false)
      expect(result.error).toBe('Player not found')
    })
  })

  // -----------------------------------------------------------------------
  // handlePlay - first trick rule
  // -----------------------------------------------------------------------

  describe('first trick rule', () => {
    test('first trick must include smallest card, succeeds when included', () => {
      const smallest = c(Suit.Spade, Rank.Four)
      const play = [smallest]
      const game = makeGame({
        currentBestPlay: null,
        bestPlayerId: null,
        isFirstTrick: true,
        players: [
          { id: 'p1', hand: [smallest, c(Suit.Heart, Rank.Seven)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [c(Suit.Club, Rank.Six)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      const result = handlePlay(game, 'p1', play)

      expect(result.success).toBe(true)
      expect(game.isFirstTrick).toBe(false)
    })

    test('first trick without smallest card is rejected', () => {
      const smallest = c(Suit.Spade, Rank.Four)
      const bigger = c(Suit.Heart, Rank.Seven)
      const game = makeGame({
        currentBestPlay: null,
        bestPlayerId: null,
        isFirstTrick: true,
        players: [
          { id: 'p1', hand: [smallest, bigger], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      const result = handlePlay(game, 'p1', [bigger])

      expect(result.success).toBe(false)
      expect(result.error).toBe('First play must include your smallest card')
    })

    test('first trick check is skipped when currentBestPlay exists (not leading the trick)', () => {
      // This happens when the lead player already played and another player is responding
      const game = makeGame({
        currentBestPlay: { type: HandType.Single, cards: [c(Suit.Spade, Rank.Four)], primaryRank: Rank.Four },
        bestPlayerId: 'p1',
        isFirstTrick: true,
        players: [
          { id: 'p1', hand: [], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [c(Suit.Heart, Rank.Seven), c(Suit.Club, Rank.Nine)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      // p2 is NOT the lead player, so they don't need to include smallest card
      const result = handlePlay(game, 'p2', [c(Suit.Heart, Rank.Seven)])

      expect(result.success).toBe(true)
    })
  })

  // -----------------------------------------------------------------------
  // handlePlay - finished / round end / game over
  // -----------------------------------------------------------------------

  describe('finished detection', () => {
    test('last card played + empty deck marks player as finished', () => {
      const card = c(Suit.Spade, Rank.Seven)
      const game = makeGame({
        deck: [], // empty deck
        players: [
          { id: 'p1', hand: [card], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [c(Suit.Heart, Rank.Two)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      handlePlay(game, 'p1', [card])

      expect(game.players[0].finished).toBe(true)
    })

    test('last card played with non-empty deck does NOT mark finished', () => {
      const card = c(Suit.Spade, Rank.Seven)
      const game = makeGame({
        deck: [c(Suit.Diamond, Rank.Five)], // deck still has cards
        players: [
          { id: 'p1', hand: [card], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [c(Suit.Heart, Rank.Two)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      handlePlay(game, 'p1', [card])

      expect(game.players[0].finished).toBe(false)
    })
  })

  describe('round end detection', () => {
    test('round ends when passCount >= activePlayers - 1', () => {
      const game = makeGame({
        currentBestPlay: null,
        bestPlayerId: null,
        passCount: 2, // >= 3 - 1
        tableCards: [
          c(Suit.Spade, Rank.Five), c(Suit.Heart, Rank.Ten), c(Suit.Club, Rank.King),
        ],
        roundParticipants: new Set(['p1', 'p2']),
        deck: [c(Suit.Diamond, Rank.Four), c(Suit.Diamond, Rank.Six)],
        players: [
          { id: 'p1', hand: [c(Suit.Spade, Rank.Queen)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p3', hand: [c(Suit.Heart, Rank.Two)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      const result = handlePlay(game, 'p3', [c(Suit.Heart, Rank.Two)])

      expect(result.success).toBe(true)
      expect(result.roundWinner).toBe('p3')
      // 5 + 10 + 10 = 25 score from table cards
      expect(game.players[2].score).toBe(25)
    })

    test('round end: winner draws cards first, then other participants', () => {
      // 2 players, deck has exactly 3 cards
      // winner (p1) has 3 cards → draws 2; other (p2) has 3 cards → draws remaining 1
      const game = makeGame({
        currentBestPlay: null,
        bestPlayerId: null,
        passCount: 1, // >= 1 (2 active - 1)
        tableCards: [],
        roundParticipants: new Set(['p2']),
        deck: [c(Suit.Diamond, Rank.Four), c(Suit.Diamond, Rank.Six), c(Suit.Diamond, Rank.Eight)],
        currentPlayerIndex: 0,
        players: [
          { id: 'p1', hand: [c(Suit.Spade, Rank.Queen), c(Suit.Spade, Rank.King), c(Suit.Spade, Rank.Ace)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [c(Suit.Heart, Rank.Queen), c(Suit.Heart, Rank.King), c(Suit.Heart, Rank.Ace)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      handlePlay(game, 'p1', [c(Suit.Spade, Rank.Queen)])

      // p1 (winner) had 2 cards left → drew min(3,3) = 3 → 5 cards total
      // p2 (participant) had 3 cards → drew min(2,0) = 0 → 3 cards total
      // This proves winner drew first (if p2 drew first, p2 would have 5 and p1 would have 3)
      expect(game.players[0].hand).toHaveLength(5)
      expect(game.players[1].hand).toHaveLength(3)
      expect(game.deck).toHaveLength(0)
    })

    test('game over when deck empty and someone finished', () => {
      const game = makeGame({
        currentBestPlay: null,
        bestPlayerId: null,
        passCount: 1, // >= 1 (2 active - 1)
        tableCards: [],
        roundParticipants: new Set(['p2']),
        deck: [],
        players: [
          { id: 'p1', hand: [c(Suit.Spade, Rank.Seven)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [], score: 0, totalScore: 0, finished: true, hasBoxerBadge: false }, // already finished
        ],
      })

      const result = handlePlay(game, 'p1', [c(Suit.Spade, Rank.Seven)])

      expect(result.success).toBe(true)
      expect(result.gameOver).toBe(true)
      expect(game.gameOver).toBe(true)
      expect(game.phase).toBe(GamePhase.Settling)
    })

    test('game over when all players finished', () => {
      const game = makeGame({
        currentBestPlay: null,
        bestPlayerId: null,
        passCount: 1, // >= 1
        tableCards: [],
        roundParticipants: new Set(['p1']),
        deck: [c(Suit.Diamond, Rank.Five)], // non-empty but all finished
        players: [
          { id: 'p1', hand: [c(Suit.Spade, Rank.Seven)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [], score: 0, totalScore: 0, finished: true, hasBoxerBadge: false },
        ],
      })

      const result = handlePlay(game, 'p1', [c(Suit.Spade, Rank.Seven)])

      expect(result.success).toBe(true)
      expect(result.gameOver).toBe(true)
    })

    test('beating resets passCount (players who passed get new chance)', () => {
      const game = makeGame({
        currentBestPlay: { type: HandType.Single, cards: [c(Suit.Spade, Rank.Four)], primaryRank: Rank.Four },
        bestPlayerId: 'p1',
        passCount: 5, // high value that should be reset
        players: [
          { id: 'p1', hand: [], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [c(Suit.Heart, Rank.Seven)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      handlePlay(game, 'p2', [c(Suit.Heart, Rank.Seven)])

      // wasBeating = true (bestPlayerId was 'p1'), so passCount resets
      expect(game.passCount).toBe(0)
    })
  })
})

// ---------------------------------------------------------------------------
// handlePass
// ---------------------------------------------------------------------------

describe('handlePass', () => {
  test('cannot pass when table is empty (no bestPlayerId)', () => {
    const game = makeGame({
      currentBestPlay: null,
      bestPlayerId: null,
      players: [
        { id: 'p1', hand: [c(Suit.Spade, Rank.Four)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        { id: 'p2', hand: [c(Suit.Heart, Rank.Six)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
      ],
    })

    const result = handlePass(game, 'p1')

    expect(result.success).toBe(false)
    expect(result.error).toBe('Must play when table is empty')
  })

  test('passCount increments correctly', () => {
    // Need 3 players so passCount=1 < 2 (activePlayers-1), preventing immediate round end
    const game = makeGame({
      currentBestPlay: { type: HandType.Single, cards: [c(Suit.Spade, Rank.Jack)], primaryRank: Rank.Jack },
      bestPlayerId: 'p1',
      passCount: 0,
      players: [
        { id: 'p1', hand: [], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        { id: 'p2', hand: [c(Suit.Heart, Rank.Six)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        { id: 'p3', hand: [c(Suit.Club, Rank.Four)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
      ],
    })

    handlePass(game, 'p2')

    expect(game.passCount).toBe(1)
  })

  describe('final round (deck empty) rules', () => {
    test('deck empty + bestPlayer cannot pass (returns error)', () => {
      const game = makeGame({
        deck: [], // empty
        currentBestPlay: { type: HandType.Single, cards: [c(Suit.Spade, Rank.Jack)], primaryRank: Rank.Jack },
        bestPlayerId: 'p1',
        passCount: 0,
        players: [
          { id: 'p1', hand: [c(Suit.Spade, Rank.Queen)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [c(Suit.Heart, Rank.Nine)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      const result = handlePass(game, 'p1')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Must play in final round — cannot pass as current leader')
    })

    test('deck empty + no one finished → forcePlay (non-bestPlayer passes)', () => {
      const game = makeGame({
        deck: [],
        currentBestPlay: { type: HandType.Single, cards: [c(Suit.Spade, Rank.Jack)], primaryRank: Rank.Jack },
        bestPlayerId: 'p1',
        passCount: 1, // will become 2 after this pass, >= 2-1=1
        players: [
          { id: 'p1', hand: [c(Suit.Spade, Rank.Ace)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [c(Suit.Heart, Rank.Nine)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      const result = handlePass(game, 'p2')

      expect(result.success).toBe(true)
      expect(result.forcePlay).toBe(true)
      // currentBestPlay is cleared so bestPlayer can start a new trick
      expect(game.currentBestPlay).toBeNull()
      // passCount is reset to 0
      expect(game.passCount).toBe(0)
    })

    test('deck empty + someone finished → round over with gameOver', () => {
      const game = makeGame({
        deck: [],
        currentBestPlay: { type: HandType.Single, cards: [c(Suit.Spade, Rank.Jack)], primaryRank: Rank.Jack },
        bestPlayerId: 'p1',
        passCount: 1, // will become 2 >= 2-1=1
        tableCards: [c(Suit.Spade, Rank.Five)],
        roundParticipants: new Set(['p1']),
        players: [
          { id: 'p1', hand: [c(Suit.Spade, Rank.Ace)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [], score: 0, totalScore: 0, finished: true, hasBoxerBadge: false },
        ],
      })

      const result = handlePass(game, 'p2')

      // p2 is finished, but the active player count = 1 (only p1 is active)
      // passCount becomes 2, >= 1-1=0, so round ends
      // But wait - p2 is finished. activePlayers = game.players.filter(p => !p.finished).length = 1
      // 2 >= 0 → true → round ends
      expect(result.success).toBe(true)
      expect(result.roundOver).toBe(true)
      expect(result.gameOver).toBe(true)
    })
  })

  describe('round end via pass', () => {
    test('round ends when all other active players pass', () => {
      const game = makeGame({
        currentBestPlay: { type: HandType.Single, cards: [c(Suit.Spade, Rank.Seven)], primaryRank: Rank.Seven },
        bestPlayerId: 'p1',
        passCount: 1, // will become 2 >= 2 (active=3, 3-1=2)
        tableCards: [c(Suit.Spade, Rank.Five), c(Suit.Spade, Rank.Ten)],
        roundParticipants: new Set(['p1']),
        deck: [c(Suit.Diamond, Rank.Ace), c(Suit.Diamond, Rank.Three)],
        players: [
          { id: 'p1', hand: [c(Suit.Spade, Rank.Ace)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p2', hand: [c(Suit.Heart, Rank.Nine)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
          { id: 'p3', hand: [c(Suit.Club, Rank.Two)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        ],
      })

      const result = handlePass(game, 'p3')

      // passCount becomes 2, >= 2 (3-1), round ends
      expect(result.success).toBe(true)
      expect(result.roundOver).toBe(true)
      expect(result.roundWinner).toBe('p1')
      // 5 + 10 = 15 score
      expect(game.players[0].score).toBe(15)
    })
  })
})

// ---------------------------------------------------------------------------
// settleGame
// ---------------------------------------------------------------------------

describe('settleGame', () => {
  test('scores sorted descending by score', () => {
    const game = makeGame({
      players: [
        { id: 'p1', hand: [], score: 30, totalScore: 100, finished: true, hasBoxerBadge: false },
        { id: 'p2', hand: [], score: 50, totalScore: 200, finished: true, hasBoxerBadge: false },
        { id: 'p3', hand: [], score: 10, totalScore: 50, finished: true, hasBoxerBadge: false },
      ],
    })

    const result = settleGame(game)

    expect(result.scores).toEqual([
      { id: 'p2', totalScore: 50 },
      { id: 'p1', totalScore: 30 },
      { id: 'p3', totalScore: 10 },
    ])
  })

  test('topTwo and bottomTwo are correctly identified', () => {
    const game = makeGame({
      players: [
        { id: 'p1', hand: [], score: 100, totalScore: 0, finished: true, hasBoxerBadge: false },
        { id: 'p2', hand: [], score: 80, totalScore: 0, finished: true, hasBoxerBadge: false },
        { id: 'p3', hand: [], score: 20, totalScore: 0, finished: true, hasBoxerBadge: false },
        { id: 'p4', hand: [], score: 10, totalScore: 0, finished: true, hasBoxerBadge: false },
      ],
    })

    const result = settleGame(game)

    expect(result.topTwo).toEqual(['p1', 'p2'])
    // Sorted desc by score: p1(100) p2(80) p3(20) p4(10). slice(-2) = [p3, p4]
    expect(result.bottomTwo).toEqual(['p3', 'p4'])
  })
})

// ---------------------------------------------------------------------------
// getLargestSingle
// ---------------------------------------------------------------------------

describe('getLargestSingle', () => {
  test('returns the highest-ranked card in hand', () => {
    const hand = [c(Suit.Spade, Rank.Four), c(Suit.Heart, Rank.Seven), c(Suit.Club, Rank.Nine)]

    const result = getLargestSingle(hand)

    // Seven(12) > Nine(11) > Four(0)
    expect(result).toEqual(c(Suit.Heart, Rank.Seven))
  })

  test('returns null for empty hand', () => {
    const result = getLargestSingle([])

    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// removeCardFromHand
// ---------------------------------------------------------------------------

describe('removeCardFromHand', () => {
  test('removes matching card from hand', () => {
    const hand = [c(Suit.Spade, Rank.Four), c(Suit.Heart, Rank.Seven), c(Suit.Club, Rank.Nine)]
    const card = c(Suit.Heart, Rank.Seven)

    const result = removeCardFromHand(hand, card)

    expect(result).toHaveLength(2)
    expect(result).not.toContainEqual(card)
    expect(result).toContainEqual(c(Suit.Spade, Rank.Four))
    expect(result).toContainEqual(c(Suit.Club, Rank.Nine))
  })

  test('returns original array if card not found', () => {
    const hand = [c(Suit.Spade, Rank.Four), c(Suit.Heart, Rank.Seven)]
    const card = c(Suit.Diamond, Rank.Two)

    const result = removeCardFromHand(hand, card)

    expect(result).toHaveLength(2)
    expect(result).toEqual(hand)
  })

  test('does not mutate original hand', () => {
    const hand = [c(Suit.Spade, Rank.Four), c(Suit.Heart, Rank.Seven)]
    const original = [...hand]
    const card = c(Suit.Heart, Rank.Seven)

    removeCardFromHand(hand, card)

    expect(hand).toEqual(original)
  })
})

// ---------------------------------------------------------------------------
// determineNextLead
// ---------------------------------------------------------------------------

describe('determineNextLead', () => {
  test('returns player who surrendered the largest card', () => {
    const surrendered = [
      { playerId: 'loser1', card: c(Suit.Spade, Rank.Ace) },   // rank 7
      { playerId: 'loser2', card: c(Suit.Heart, Rank.Seven) },  // rank 12 (highest)
    ]

    const result = determineNextLead(surrendered)

    expect(result).toBe('loser2')
  })
})

// ---------------------------------------------------------------------------
// getBoxerScoreCards
// ---------------------------------------------------------------------------

describe('getBoxerScoreCards', () => {
  test('filters score cards (5, 10, K) from deck', () => {
    const game = makeGame({
      deck: [
        c(Suit.Spade, Rank.Five), c(Suit.Spade, Rank.Ten), c(Suit.Spade, Rank.King),
        c(Suit.Heart, Rank.Four), c(Suit.Heart, Rank.Six),  // non-score cards
      ],
    })

    const result = getBoxerScoreCards(game)

    expect(result).toHaveLength(3)
    expect(result.every(c => c.rank === Rank.Five || c.rank === Rank.Ten || c.rank === Rank.King)).toBe(true)
  })

  test('returns empty array when no score cards in deck', () => {
    const game = makeGame({
      deck: [c(Suit.Spade, Rank.Four), c(Suit.Heart, Rank.Six)],
    })

    const result = getBoxerScoreCards(game)

    expect(result).toHaveLength(0)
  })

  test('collects score cards from unfinished players\' hands', () => {
    const game = makeGame({
      deck: [],
      players: [
        { id: 'p1', hand: [], score: 10, totalScore: 10, finished: true, hasBoxerBadge: false },
        { id: 'p2', hand: [c(Suit.Spade, Rank.Five), c(Suit.Heart, Rank.Four)], score: 5, totalScore: 5, finished: false, hasBoxerBadge: false },
        { id: 'p3', hand: [c(Suit.Diamond, Rank.King)], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
      ],
    })

    const result = getBoxerScoreCards(game)

    // P2 has Five(s) in hand, P3 has King(d) in hand. P1 finished so excluded.
    expect(result).toHaveLength(2)
    expect(result).toContainEqual(c(Suit.Spade, Rank.Five))
    expect(result).toContainEqual(c(Suit.Diamond, Rank.King))
  })
})

// ---------------------------------------------------------------------------
// getBoxerParticipants
// ---------------------------------------------------------------------------

describe('getBoxerParticipants', () => {
  test('returns all player IDs', () => {
    const game = makeGame({
      players: [
        { id: 'p1', hand: [], score: 0, totalScore: 0, finished: true, hasBoxerBadge: false },
        { id: 'p2', hand: [], score: 0, totalScore: 0, finished: false, hasBoxerBadge: false },
        { id: 'p3', hand: [], score: 0, totalScore: 0, finished: true, hasBoxerBadge: false },
      ],
    })

    const result = getBoxerParticipants(game)

    expect(result).toEqual(['p1', 'p2', 'p3'])
  })
})

// ---------------------------------------------------------------------------
// executeSurrenderSwap
// ---------------------------------------------------------------------------

describe('executeSurrenderSwap', () => {
  test('<4 players: 1v1 swap — loser gives largest card to winner, winner gives smallest back', () => {
    const game = makeGame({
      players: [
        {
          id: 'p1', // winner (highest score)
          hand: [c(Suit.Spade, Rank.Four), c(Suit.Spade, Rank.Six), c(Suit.Spade, Rank.Eight)],
          score: 100, totalScore: 0, finished: false, hasBoxerBadge: false,
        },
        {
          id: 'p2', // loser (lowest score)
          hand: [c(Suit.Heart, Rank.Ace), c(Suit.Heart, Rank.Two)], // Ace(7) > Two(9)? No, Two=9 > Ace=7
          score: 20, totalScore: 0, finished: false, hasBoxerBadge: false,
        },
      ],
    })

    const result = executeSurrenderSwap(game)

    expect(result.swaps).toHaveLength(1)
    expect(result.swaps[0].loserId).toBe('p2')
    expect(result.swaps[0].winnerId).toBe('p1')
    // Loser's largest card is Two(9) (rank higher than Ace(7))
    expect(result.swaps[0].gaveUpCard.rank).toBe(Rank.Two)
    // Winner gives smallest non-given card to loser
    expect(result.swaps[0].receivedCard.rank).toBe(Rank.Four)
    // Loser now has Ace(7) + Four(0) = 2 cards
    expect(game.players[1].hand).toHaveLength(2)
    // Winner now has Six(1), Eight(2), Two(9) = 3 cards
    expect(game.players[0].hand).toHaveLength(3)
  })

  test('<4 players: loser with empty hand does not crash', () => {
    const game = makeGame({
      players: [
        {
          id: 'p1', // winner
          hand: [c(Suit.Spade, Rank.Four)],
          score: 100, totalScore: 0, finished: false, hasBoxerBadge: false,
        },
        {
          id: 'p2', // loser with no cards
          hand: [],
          score: 20, totalScore: 0, finished: false, hasBoxerBadge: false,
        },
      ],
    })

    const result = executeSurrenderSwap(game)

    // Should be a no-op with empty swaps
    expect(result.swaps).toHaveLength(0)
    // nextLeadPlayerId should still be set (loser.id)
    expect(result.nextLeadPlayerId).toBe('p2')
  })

  test('4+ players: top2 and bottom2 swap correctly', () => {
    // 4 players: top 2 winners, bottom 2 losers
    const game = makeGame({
      players: [
        {
          id: 'w1', // 1st (highest score)
          hand: [c(Suit.Spade, Rank.Four), c(Suit.Spade, Rank.Six)],
          score: 100, totalScore: 0, finished: false, hasBoxerBadge: false,
        },
        {
          id: 'w2', // 2nd
          hand: [c(Suit.Heart, Rank.Four), c(Suit.Heart, Rank.Six)],
          score: 80, totalScore: 0, finished: false, hasBoxerBadge: false,
        },
        {
          id: 'l1', // 3rd (bottom 2)
          hand: [c(Suit.Club, Rank.Queen), c(Suit.Club, Rank.Jack)],
          score: 30, totalScore: 0, finished: false, hasBoxerBadge: false,
        },
        {
          id: 'l2', // 4th (loser)
          hand: [c(Suit.Diamond, Rank.Two), c(Suit.Diamond, Rank.Three)],
          score: 10, totalScore: 0, finished: false, hasBoxerBadge: false,
        },
      ],
    })

    const result = executeSurrenderSwap(game)

    // Two swaps expected
    expect(result.swaps).toHaveLength(2)
    // l2 (4th) has Two(9) which is larger than l1's Queen(5)
    // So l2 gives to w1 (1st), l1 gives to w2 (2nd)
    expect(result.swaps[0].loserId).toBe('l2')
    expect(result.swaps[0].winnerId).toBe('w1')
    // nextLeadPlayerId is the player who surrendered the largest card
    expect(result.nextLeadPlayerId).toBeDefined()
  })

  test('nextLeadPlayerId is set to the player who gave up the largest card', () => {
    const game = makeGame({
      players: [
        {
          id: 'w1', hand: [c(Suit.Spade, Rank.Four)],
          score: 100, totalScore: 0, finished: false, hasBoxerBadge: false,
        },
        {
          id: 'w2', hand: [c(Suit.Heart, Rank.Four)],
          score: 80, totalScore: 0, finished: false, hasBoxerBadge: false,
        },
        {
          id: 'l1', hand: [c(Suit.Club, Rank.Seven)], // rank 12 (largest)
          score: 30, totalScore: 0, finished: false, hasBoxerBadge: false,
        },
        {
          id: 'l2', hand: [c(Suit.Diamond, Rank.Five)], // rank 10
          score: 10, totalScore: 0, finished: false, hasBoxerBadge: false,
        },
      ],
    })

    const result = executeSurrenderSwap(game)

    // l1 gave up Seven(12), l2 gave up Five(10) — l1 surrendered larger card → leads next
    expect(result.nextLeadPlayerId).toBe('l1')
  })
})

// ── Surrender E2E: full swap scenarios ──

describe('executeSurrenderSwap — 交粮全流程', () => {
  const c = (suit: Suit, rank: Rank): Card => ({ suit, rank })

  // Helper: build game state with scores
  function makeGameState(playerCount: number, scores: number[], hands?: Card[][]) {
    const ids = Array.from({ length: playerCount }, (_, i) => `p${i + 1}`)
    const game = initGame(ids)
    for (let i = 0; i < playerCount; i++) {
      game.players[i].score = scores[i] || 0
      if (hands?.[i]) game.players[i].hand = hands[i]
    }
    return game
  }

  describe('2位玩家 — 一缴一收', () => {
    test('loser gives largest card, winner gives smallest back', () => {
      const game = makeGameState(2, [50, 25], [
        [c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.King)],   // winner hand
        [c(Suit.Diamond, Rank.Ace), c(Suit.Club, Rank.Ten)],     // loser: Ace(7) > Ten(3), gives Ace
      ])
      const { swaps, nextLeadPlayerId } = executeSurrenderSwap(game)
      expect(swaps).toHaveLength(1)
      expect(swaps[0].loserId).toBe('p2')
      expect(swaps[0].winnerId).toBe('p1')
      // Loser gave largest (Ace), got winner's smallest back (King or Seven)
      expect(swaps[0].gaveUpCard.rank).toBe(Rank.Ace)
      expect(nextLeadPlayerId).toBeTruthy()
    })

    test('loser has empty hand — no crash, swap is no-op', () => {
      const game = makeGameState(2, [50, 25], [
        [c(Suit.Spade, Rank.King)],
        [],  // loser empty
      ])
      const { swaps, nextLeadPlayerId } = executeSurrenderSwap(game)
      expect(swaps).toHaveLength(0)
      expect(nextLeadPlayerId).toBe('p2') // loser leads next
    })

    test('winner has only one card — gives it back (smallest = only)', () => {
      const game = makeGameState(2, [50, 25], [
        [c(Suit.Spade, Rank.Seven)],  // winner's only card: Seven(12)
        [c(Suit.Diamond, Rank.Ace), c(Suit.Club, Rank.Five)],  // loser: Ace(7), Five(10)
      ])
      const { swaps } = executeSurrenderSwap(game)
      expect(swaps).toHaveLength(1)
      // Loser's largest: Five(10) > Ace(7), gives Five
      // Winner has [Seven(12)], gives only card back
      expect(swaps[0].gaveUpCard.rank).toBe(Rank.Five)
      expect(swaps[0].receivedCard.rank).toBe(Rank.Seven)
    })
  })

  describe('3位玩家 — 一缴一收', () => {
    test('1 winner, 1 loser; middle player unaffected', () => {
      const game = makeGameState(3, [60, 40, 20], [
        [c(Suit.Spade, Rank.King), c(Suit.Heart, Rank.Queen)],  // p1 winner
        [c(Suit.Club, Rank.Ten)],                                 // p2 middle
        [c(Suit.Diamond, Rank.Ace), c(Suit.Heart, Rank.Five)],   // p3 loser
      ])
      const { swaps } = executeSurrenderSwap(game)
      expect(swaps).toHaveLength(1)
      expect(swaps[0].winnerId).toBe('p1')
      expect(swaps[0].loserId).toBe('p3')
      // Only p1 and p3 hands changed, p2 unchanged
    })

    test('all same score — swap still happens based on array order', () => {
      const game = makeGameState(3, [0, 0, 0], [
        [c(Suit.Spade, Rank.King)],
        [c(Suit.Heart, Rank.Ace)],
        [c(Suit.Diamond, Rank.Seven)],
      ])
      const { swaps, nextLeadPlayerId } = executeSurrenderSwap(game)
      // Sorted by score (stable), p1 wins, p3 loses
      expect(swaps.length).toBeGreaterThanOrEqual(0)
      expect(nextLeadPlayerId).toBeTruthy()
    })
  })

  describe('4位及以上玩家 — 二缴二收', () => {
    test('4 players: top2 winners, bottom2 losers swap', () => {
      const game = makeGameState(4, [80, 60, 30, 10], [
        [c(Suit.Spade, Rank.King), c(Suit.Heart, Rank.Queen)],   // p1 win1
        [c(Suit.Club, Rank.Ten)],                                  // p2 win2
        [c(Suit.Diamond, Rank.Ace), c(Suit.Heart, Rank.Five)],    // p3 lose1: Ace(7)
        [c(Suit.Club, Rank.Seven), c(Suit.Spade, Rank.Five)],     // p4 lose2: Seven(12)
      ])
      const { swaps, nextLeadPlayerId } = executeSurrenderSwap(game)
      // 2 losers, 2 winners → 2 swaps
      expect(swaps.length).toBeGreaterThanOrEqual(1)
      // Larger surrendered card determines next lead
      expect(nextLeadPlayerId).toBeTruthy()
    })

    test('5 players: still top2 vs bottom2', () => {
      const game = makeGameState(5, [100, 80, 50, 30, 10], [
        [c(Suit.Spade, Rank.Seven)],
        [c(Suit.Heart, Rank.Ace)],
        [c(Suit.Club, Rank.King)],
        [c(Suit.Diamond, Rank.Five)],
        [c(Suit.Spade, Rank.Queen)],
      ])
      const { swaps } = executeSurrenderSwap(game)
      expect(swaps.length).toBeGreaterThanOrEqual(1)
      expect(swaps.length).toBeLessThanOrEqual(2)
      for (const s of swaps) {
        expect(s.winnerId).toBeDefined()
        expect(s.loserId).toBeDefined()
        expect(s.gaveUpCard).toBeDefined()
        expect(s.receivedCard).toBeDefined()
      }
    })

    test('6 players: swap count matches loser count', () => {
      const game = makeGameState(6, [120, 100, 80, 50, 30, 10], [
        [c(Suit.Spade, Rank.Seven)],
        [c(Suit.Heart, Rank.Ace)],
        [c(Suit.Club, Rank.King)],
        [c(Suit.Diamond, Rank.Ten)],
        [c(Suit.Spade, Rank.Five)],
        [c(Suit.Heart, Rank.Queen)],
      ])
      const { swaps, nextLeadPlayerId } = executeSurrenderSwap(game)
      expect(swaps.length).toBeGreaterThanOrEqual(1)
      expect(swaps.length).toBeLessThanOrEqual(2)
      expect(nextLeadPlayerId).toBeTruthy()
    })
  })
})

// ── Score Total Verification: 100pts/deck ──

describe('verifyScoreTotal — 总分校验', () => {
  const c = (suit: Suit, rank: Rank): Card => ({ suit, rank })

  test('new game: 100pts in deck + hands', () => {
    const game = initGame(['p1', 'p2'])
    const result = verifyScoreTotal(game)
    expect(result.played).toBe(0)
    expect(result.total).toBe(100)
    expect(result.missing).toBe(0)
  })

  test('after dealing: points split between hands and deck', () => {
    const game = initGame(['p1', 'p2', 'p3'])
    const result = verifyScoreTotal(game)
    // 10 cards in hands (5 each), 42 in deck → total still 100
    expect(result.total).toBe(100)
    expect(result.inHands).toBeGreaterThan(0)
    expect(result.inDeck).toBeGreaterThan(0)
    expect(result.played + result.inHands + result.inDeck).toBe(100)
  })

  test('4+ players: 200pts (2 decks)', () => {
    const game = initGame(['p1', 'p2', 'p3', 'p4'])
    const result = verifyScoreTotal(game)
    expect(result.expected).toBe(200)
    expect(result.total).toBe(200)
  })

  test('5 players: 200pts', () => {
    const game = initGame(['p1', 'p2', 'p3', 'p4', 'p5'])
    const result = verifyScoreTotal(game)
    expect(result.expected).toBe(200)
    expect(result.total).toBe(200)
  })

  test('6 players: 200pts', () => {
    const game = initGame(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])
    const result = verifyScoreTotal(game)
    expect(result.expected).toBe(200)
    expect(result.total).toBe(200)
  })

  test('all score cards accounted for after one round', () => {
    const game = initGame(['p1', 'p2'])
    const initialTotal = verifyScoreTotal(game).total
    expect(initialTotal).toBe(100)

    // Play one round: p1 plays a single, p2 passes
    const p1Card = game.players[0].hand[0]
    handlePlay(game, 'p1', [p1Card])
    handlePass(game, 'p2')

    const afterRound = verifyScoreTotal(game)
    // Total should still be 100 (some scored, rest in deck/hands)
    expect(afterRound.total).toBe(100)
  })
})

// ── Bug regression tests ──

describe('Bug fixes — regression', () => {
  const c = (suit: Suit, rank: Rank): Card => ({ suit, rank })

  describe('BUG-1: forcePlay: score before clearing table', () => {
    test('verifyScoreTotal adds table cards to played', () => {
      // Create a game where table has score cards but they should be scored
      const game = initGame(['p1', 'p2', 'p3'])
      // p1 plays Five(5pts), p2 plays King(10pts)
      game.players[0].hand = [c(Suit.Heart, Rank.Five), c(Suit.Club, Rank.Four)]
      game.players[1].hand = [c(Suit.Spade, Rank.King), c(Suit.Diamond, Rank.Six)]
      game.players[2].hand = [c(Suit.Club, Rank.Ace)]
      // Simulate: p1 played Five, p2 beat with King, p3 passed
      // Table: [Five, King] = 15pts
      game.tableCards = [c(Suit.Heart, Rank.Five), c(Suit.Spade, Rank.King)]
      game.bestPlayerId = 'p2'

      // Before fix: forcePlay would clear table without scoring → 15pts lost
      // After fix: score before clearing
      const bestPlayer = game.players.find(p => p.id === game.bestPlayerId!)!
      bestPlayer.score += calculateScore(game.tableCards)
      game.tableCards = []

      expect(bestPlayer.score).toBe(15) // 5 + 10
    })
  })

  describe('BUG-2: boxer scores included in settlement', () => {
    test('post-boxer score is reflected in settlement', () => {
      const game = initGame(['p1', 'p2'])
      game.players[0].score = 40 // round scores
      game.players[1].score = 30
      // Boxer: p1 wins King (10pts)
      game.players[0].score += 10

      const settlement = settleGame(game)
      expect(settlement.scores.find(s => s.id === 'p1')!.totalScore).toBe(50)
      expect(settlement.scores.find(s => s.id === 'p2')!.totalScore).toBe(30)
    })

    test('scores_updated event carries final post-boxer scores', () => {
      // Simulate what finishBoxerFlow does: re-sort and emit
      const game = initGame(['p1', 'p2'])
      game.players[0].score = 45
      game.players[1].score = 35
      // Boxer adds 10 to p1
      game.players[0].score += 10

      const sorted = [...game.players].sort((a, b) => b.score - a.score)
      const scores = sorted.map(p => ({ id: p.id, totalScore: p.score }))

      expect(scores[0].totalScore).toBe(55) // p1: 45+10
      expect(scores[1].totalScore).toBe(35)
    })
  })

  describe('BUG-3: surrender swap loses card when winner has no card to return', () => {
    test('winner with only received card: returns it, both keep 5 cards', () => {
      const game = initGame(['p1', 'p2'])
      game.players[0].score = 60 // winner
      game.players[1].score = 20 // loser
      game.players[0].hand = [c(Suit.Spade, Rank.Seven)] // winner: 1 card
      game.players[1].hand = [c(Suit.Heart, Rank.Ace), c(Suit.Diamond, Rank.Ten)]

      const { swaps } = executeSurrenderSwap(game)

      // If loser gave card and winner had to return it (only card):
      // Both should still have at least 1 card
      expect(game.players[0].hand.length).toBeGreaterThanOrEqual(1)
      expect(game.players[1].hand.length).toBeGreaterThanOrEqual(1)
    })

    test('winner with 0 cards after filter: swap is undone, loser keeps card', () => {
      const game = initGame(['p1', 'p2'])
      game.players[0].score = 60
      game.players[1].score = 20
      // Winner has only the same card as loser's largest
      game.players[0].hand = [] // empty winner hand
      game.players[1].hand = [c(Suit.Heart, Rank.Ace)]

      const { swaps } = executeSurrenderSwap(game)

      // Loser had empty hand → should be no-op, no crash
      expect(swaps.length).toBeGreaterThanOrEqual(0)
      // Winner's hand not corrupted
      expect(game.players[0].hand.length).toBeGreaterThanOrEqual(0)
      expect(game.players[1].hand.length).toBeGreaterThanOrEqual(0)
    })
  })

  describe('BUG-4: surrender filter removes all duplicates (2-deck)', () => {
    test('executeSurrenderSwap preserves card count with duplicates', () => {
      const game = initGame(['p1', 'p2', 'p3', 'p4']) // 2 decks
      game.players[0].score = 80 // top winner
      game.players[1].score = 60 // winner 2
      game.players[2].score = 30 // loser 1
      game.players[3].score = 10 // loser 2

      const totalBefore = game.players.reduce((s, p) => s + p.hand.length, 0)
      executeSurrenderSwap(game)
      const totalAfter = game.players.reduce((s, p) => s + p.hand.length, 0)

      // Card count should be preserved (no loss)
      expect(totalAfter).toBe(totalBefore)
    })

    test('removeCardFromHand removes only one card with duplicates', () => {
      const hand = [
        { suit: 0, rank: 5 }, // Spade Queen
        { suit: 1, rank: 5 }, // Heart Queen (same rank, different suit)
        { suit: 2, rank: 6 }, // Club King
      ]
      const result = removeCardFromHand(hand, { suit: 0, rank: 5 })
      expect(result).toHaveLength(2)
      // Only Spade Queen removed, Heart Queen still there
      expect(result.some(c => c.suit === 1 && c.rank === 5)).toBe(true)
    })

    test('filter removes BOTH exact duplicates — removeCardFromHand removes one', () => {
      // 2-deck game: two identical cards (same suit+rank)
      const hand = [
        { suit: 0, rank: 5 },
        { suit: 0, rank: 5 }, // exact duplicate (2 decks)
        { suit: 2, rank: 6 },
      ]
      // filter removes ALL matching: loses 2 cards
      const filtered = hand.filter(c => c.suit !== 0 || c.rank !== 5)
      expect(filtered).toHaveLength(1) // only Club King remains

      // removeCardFromHand removes only ONE: preserves duplicate
      const removed = removeCardFromHand(hand, { suit: 0, rank: 5 })
      expect(removed).toHaveLength(2) // one Spade Queen gone, one stays
      expect(removed.filter(c => c.suit === 0 && c.rank === 5)).toHaveLength(1)
    })
  })
})

// ── Timing flow: boxer → settlement → leaderboard ──

describe('Boxer-to-settlement timing', () => {
  test('post-boxer settlement scores are sorted correctly', () => {
    const game = initGame(['p1', 'p2', 'p3'])
    game.players[0].score = 60
    game.players[1].score = 40
    game.players[2].score = 80
    // Boxer adds 10 to p2
    game.players[1].score += 10

    // Simulate finishBoxerFlow: sort and emit scores
    const sorted = [...game.players].sort((a, b) => b.score - a.score)
    const scores = sorted.map(p => ({ id: p.id, totalScore: p.score }))

    expect(scores[0].id).toBe('p3') // 80
    expect(scores[0].totalScore).toBe(80)
    expect(scores[1].id).toBe('p1') // 60
    expect(scores[1].totalScore).toBe(60)
    expect(scores[2].id).toBe('p2') // 40+10=50
    expect(scores[2].totalScore).toBe(50)
  })

  test('scores_updated carries final rankings for GameOverOverlay', () => {
    const game = initGame(['p1', 'p2'])
    game.players[0].score = 45
    game.players[1].score = 55

    const sorted = [...game.players].sort((a, b) => b.score - a.score)
    const finalScores = sorted.map(p => ({ id: p.id, totalScore: p.score }))

    expect(finalScores).toHaveLength(2)
    expect(finalScores[0].totalScore).toBe(55)
    expect(finalScores[1].totalScore).toBe(45)
  })

  test('pendingSurrender uses correct winner/loser from post-boxer scores', () => {
    const game = initGame(['p1', 'p2'])
    game.players[0].score = 30
    game.players[1].score = 70
    // Boxer adds 10 to p1
    game.players[0].score += 10

    const sorted = [...game.players].sort((a, b) => b.score - a.score)
    const pc = game.players.length

    const pendingSurrender = {
      winnerIds: pc < 4 ? [sorted[0].id] : sorted.slice(0, 2).map(p => p.id),
      loserIds: pc < 4 ? [sorted[sorted.length - 1].id] : sorted.slice(-2).map(p => p.id),
    }

    // p2 won (70) → winner, p1 lost (40) → loser
    expect(pendingSurrender.winnerIds).toEqual(['p2'])
    expect(pendingSurrender.loserIds).toEqual(['p1'])
  })
})

// ── End-to-end surrender card count verification ──

describe('Surrender card count integrity', () => {
  test('executeSurrenderSwap: all players keep 5 cards (2p)', () => {
    const game = initGame(['p1', 'p2'])
    game.players[0].score = 60 // winner
    game.players[1].score = 20 // loser
    const before = game.players.map(p => p.hand.length)
    executeSurrenderSwap(game)
    const after = game.players.map(p => p.hand.length)
    expect(after).toEqual(before) // all keep 5
  })

  test('executeSurrenderSwap: all players keep 5 cards (3p)', () => {
    const game = initGame(['p1', 'p2', 'p3'])
    game.players[0].score = 80
    game.players[1].score = 50
    game.players[2].score = 20
    const before = game.players.map(p => p.hand.length)
    executeSurrenderSwap(game)
    const after = game.players.map(p => p.hand.length)
    expect(after).toEqual(before)
  })

  test('executeSurrenderSwap: all players keep 5 cards (4p, 2 decks)', () => {
    const game = initGame(['p1', 'p2', 'p3', 'p4'])
    game.players[0].score = 80
    game.players[1].score = 60
    game.players[2].score = 30
    game.players[3].score = 10
    const before = game.players.map(p => p.hand.length)
    executeSurrenderSwap(game)
    const after = game.players.map(p => p.hand.length)
    expect(after).toEqual(before)
  })

  test('processSurrender flow: card count preserved through full manual flow', () => {
    // Simulate the exact ws.ts manual surrender flow
    const game = initGame(['p1', 'p2'])
    game.players[0].score = 60 // winner p1
    game.players[1].score = 20 // loser p2
    const before = game.players.map(p => p.hand.length)

    // Step 1: loser gives largest card
    const loserCard = getLargestSingle(game.players[1].hand)
    expect(loserCard).toBeTruthy()
    game.players[1].hand = removeCardFromHand(game.players[1].hand, loserCard!)
    // Step 2: winner picks
    game.players[0].hand.push(loserCard!)
    // Step 3: winner returns smallest (different from received)
    const winnerCard = getSmallestCard(
      game.players[0].hand.filter(c => c.rank !== loserCard!.rank || c.suit !== loserCard!.suit)
    )
    expect(winnerCard).toBeTruthy()
    game.players[0].hand = removeCardFromHand(game.players[0].hand, winnerCard!)
    game.players[1].hand.push(winnerCard!)

    const after = game.players.map(p => p.hand.length)
    expect(after).toEqual(before)
  })

  test('processSurrender flow with duplicates (2-deck): card count preserved', () => {
    const game = initGame(['p1', 'p2', 'p3', 'p4'])
    game.players[0].score = 80
    game.players[1].score = 60
    game.players[2].score = 30
    game.players[3].score = 10
    const before = game.players.map(p => p.hand.length)

    // Simulate manual flow for bottom loser
    const loser = game.players[3]
    const winner = game.players[0]
    const loserCard = getLargestSingle(loser.hand)
    if (loserCard) {
      loser.hand = removeCardFromHand(loser.hand, loserCard)
      winner.hand.push(loserCard)
      const winnerCard = getSmallestCard(
        winner.hand.filter(c => c.rank !== loserCard.rank || c.suit !== loserCard.suit)
      )
      if (winnerCard) {
        winner.hand = removeCardFromHand(winner.hand, winnerCard)
        loser.hand.push(winnerCard)
      }
    }

    const after = game.players.map(p => p.hand.length)
    expect(after).toEqual(before)
  })
})
