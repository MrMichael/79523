import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { Suit, Rank } from '@79523/engine'

// Capture the socket handlers that useGame() registers so we can drive the real code.
const { fakeSocket, handlers } = vi.hoisted(() => {
  const handlers: Record<string, ((...args: any[]) => void)[]> = {}
  const fakeSocket = {
    on: vi.fn((evt: string, fn: (...args: any[]) => void) => { (handlers[evt] ||= []).push(fn) }),
    emit: vi.fn(),
    disconnect: vi.fn(),
    off: vi.fn(),
  }
  return { fakeSocket, handlers }
})

vi.mock('socket.io-client', () => ({ io: vi.fn(() => fakeSocket), Socket: class {} }))
vi.mock('vue-router', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), currentRoute: { value: { params: { code: 'TEST' } } } })),
}))

import { useSocket } from '../../src/composables/useSocket'
import { useGame, resetGame } from '../../src/composables/useGame'
import { useGameStore } from '../../src/stores/game'

const fire = (evt: string, payload?: any) => {
  for (const fn of handlers[evt] || []) fn(payload)
}
const c = (suit: Suit, rank: Rank) => ({ suit, rank })

describe('useGame event wiring (real handlers)', () => {
  let store: ReturnType<typeof useGameStore>
  let game: ReturnType<typeof useGame>

  beforeEach(() => {
    setActivePinia(createPinia())
    for (const k of Object.keys(handlers)) delete handlers[k]
    vi.clearAllMocks()
    useSocket().connect()
    resetGame()
    game = useGame()
    game.setupListeners()
    store = useGameStore()
  })

  afterEach(() => { resetGame() })

  it('registers the core game listeners', () => {
    for (const evt of ['game_started', 'your_turn', 'play_made', 'pass_made', 'round_result', 'game_over', 'boxer_start', 'full_state']) {
      expect(handlers[evt]?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('game_started: populates hand/id/players and clears the previous game', () => {
    store.finalRankings = [{ id: 'old', totalScore: 9 }]
    const hand = [c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.Five)]
    fire('game_started', {
      hand, myId: 'p1', leadPlayerId: 'p2', deckCount: 84,
      playerNames: { p1: '甲', p2: '乙' },
      players: [
        { id: 'p1', score: 0, cardCount: 5, wins: 0, boxerWins: 0 },
        { id: 'p2', score: 0, cardCount: 5, wins: 2, boxerWins: 1 },
      ],
    })
    expect(store.myHand).toEqual(hand)
    expect(store.myId).toBe('p1')
    expect(store.currentPlayerId).toBe('p2')
    expect(store.deckCount).toBe(84)
    expect(store.finalRankings).toEqual([])
    expect(store.scores).toEqual({ p1: 0, p2: 0 })
    expect(game.players.value).toHaveLength(2)
    expect(game.players.value[1]).toMatchObject({ id: 'p2', name: '乙', wins: 2, boxerWins: 1 })
  })

  it('your_turn: marks my turn and updates hand/deck', () => {
    fire('game_started', { hand: [], myId: 'p1', leadPlayerId: 'p1', deckCount: 80, playerNames: { p1: '甲' }, players: [{ id: 'p1', score: 0, cardCount: 5 }] })
    const hand = [c(Suit.Club, Rank.Nine)]
    fire('your_turn', { timeout: 30, hand, deckCount: 79 })
    expect(store.isMyTurn).toBe(true)
    expect(store.timeLeft).toBe(30)
    expect(store.currentPlayerId).toBe('p1')
    expect(store.myHand).toEqual(hand)
    expect(store.deckCount).toBe(79)
  })

  it('play_made (mine): removes played cards from hand and advances turn', () => {
    fire('game_started', { hand: [], myId: 'p1', leadPlayerId: 'p1', deckCount: 80, playerNames: { p1: '甲', p2: '乙' }, players: [{ id: 'p1', score: 0, cardCount: 5 }, { id: 'p2', score: 0, cardCount: 5 }] })
    const card = c(Suit.Spade, Rank.Seven)
    store.myHand = [card, c(Suit.Heart, Rank.Five)]
    store.isMyTurn = true
    fire('play_made', { playerId: 'p1', nextPlayerId: 'p2', play: { type: 'single', cards: [card] }, tableCards: [card] })
    expect(store.myHand).toEqual([c(Suit.Heart, Rank.Five)])
    expect(store.tableCards).toEqual([card])
    expect(store.isMyTurn).toBe(false)
    expect(store.currentPlayerId).toBe('p2')
    expect(game.players.value.find(p => p.id === 'p1')!.cardCount).toBe(4)
  })

  it('pass_made: clears turn and moves to next player', () => {
    store.isMyTurn = true
    fire('pass_made', { playerId: 'p1', nextPlayerId: 'p2' })
    expect(store.isMyTurn).toBe(false)
    expect(store.currentPlayerId).toBe('p2')
    expect(store.lastPassPlayer).toBeTruthy()
  })

  it('round_result: applies scores/hand sizes and clears the table', () => {
    fire('game_started', { hand: [], myId: 'p1', leadPlayerId: 'p1', deckCount: 80, playerNames: { p1: '甲', p2: '乙' }, players: [{ id: 'p1', score: 0, cardCount: 5 }, { id: 'p2', score: 0, cardCount: 5 }] })
    store.tableCards = [c(Suit.Spade, Rank.Five)]
    store.isMyTurn = true
    fire('round_result', {
      winnerId: 'p1', scoreCards: [c(Suit.Spade, Rank.Five)],
      scores: [{ id: 'p1', score: 5 }, { id: 'p2', score: 0 }],
      playerHandSizes: [{ id: 'p1', cardCount: 3 }, { id: 'p2', cardCount: 4 }],
    })
    expect(store.scores).toMatchObject({ p1: 5, p2: 0 })
    expect(store.tableCards).toEqual([])
    expect(store.roundWinnerId).toBe('p1')
    expect(store.isMyTurn).toBe(false)
    expect(game.players.value.find(p => p.id === 'p1')!.cardCount).toBe(3)
  })

  it('game_over: sets final rankings and the gameOver flag', () => {
    fire('game_over', { scores: [{ id: 'p1', totalScore: 55 }, { id: 'p2', totalScore: 45 }] })
    expect(store.gameOver).toBe(true)
    expect(store.scores).toEqual({ p1: 55, p2: 45 })
    expect(store.finalRankings).toEqual([{ id: 'p1', totalScore: 55 }, { id: 'p2', totalScore: 45 }])
  })

  it('boxer_start: initializes boxer state', () => {
    const scoreCard = c(Suit.Heart, Rank.King)
    fire('boxer_start', { scoreCard, participants: ['p1', 'p2'], gameScores: { p1: 10, p2: 0 } })
    expect(store.boxerPhase).toBe('awaiting')
    expect(store.boxerScoreCard).toEqual(scoreCard)
    expect(store.boxerSurvivors).toEqual(['p1', 'p2'])
    expect(store.boxerGameScores).toEqual({ p1: 10, p2: 0 })
  })

  it('boxer_eliminated: removes a player and flags my elimination', () => {
    store.myId = 'p2'
    store.boxerSurvivors = ['p1', 'p2']
    store.boxerParticipants = ['p1', 'p2']
    fire('boxer_eliminated', { playerId: 'p2' })
    expect(store.boxerSurvivors).toEqual(['p1'])
    expect(store.boxerPhase).toBe('eliminated')
  })

  it('room_stats_updated: refreshes cumulative wins for known players', () => {
    fire('game_started', { hand: [], myId: 'p1', leadPlayerId: 'p1', deckCount: 80, playerNames: { p1: '甲' }, players: [{ id: 'p1', score: 0, cardCount: 5, wins: 0, boxerWins: 0 }] })
    fire('room_stats_updated', { stats: [{ id: 'p1', name: '甲', wins: 3, boxerWins: 2 }] })
    expect(game.players.value[0]).toMatchObject({ wins: 3, boxerWins: 2 })
  })

  it('full_state: restores players, hand sizes and my turn', () => {
    fire('full_state', {
      myHand: [c(Suit.Spade, Rank.Four)], deck: [1, 2, 3], myId: 'p2',
      players: [
        { id: 'p1', hand: [c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.Six)], score: 5 },
        { id: 'p2', hand: [c(Suit.Spade, Rank.Four)], score: 10 },
      ],
      currentPlayerIndex: 1,
      roomPlayerStats: { p1: { wins: 1, boxerWins: 0 }, p2: { wins: 0, boxerWins: 2 } },
    })
    expect(store.myHand).toHaveLength(1)
    expect(store.deckCount).toBe(3)
    expect(store.isMyTurn).toBe(true)
    expect(store.currentPlayerId).toBe('p2')
    expect(game.players.value.find(p => p.id === 'p1')!.cardCount).toBe(2)
    expect(game.players.value.find(p => p.id === 'p2')!.boxerWins).toBe(2)
  })
})
