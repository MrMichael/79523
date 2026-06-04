import type { Card, GamePhase, BoxerMove } from '@79523/engine'

export interface Player {
  id: string
  name: string
  socketId: string
  ready: boolean
  connected: boolean
}

export interface Room {
  code: string
  maxPlayers: number
  players: Player[]
  createdAt: number
  game: ServerGame | null
}

export interface ServerGame {
  phase: GamePhase
  deck: Card[]
  players: GamePlayer[]
  currentPlayerIndex: number
  currentBestPlay: { type: string; cards: Card[]; primaryRank: number } | null
  bestPlayerId: string | null
  passCount: number
  tableCards: Card[]
  gameOver: boolean
  roundParticipants: Set<string>
}

export interface GamePlayer {
  id: string
  hand: Card[]
  score: number
  totalScore: number
  finished: boolean
  hasBoxerBadge: boolean
}

export interface ServerEvents {
  room_created: (data: { roomCode: string }) => void
  player_joined: (data: { players: Player[] }) => void
  player_left: (data: { playerId: string; players: Player[] }) => void
  game_started: (data: { hand: Card[]; players: GamePlayer[]; leadPlayerId: string }) => void
  your_turn: (data: { timeout: number }) => void
  play_made: (data: { playerId: string; play: { type: string; cards: Card[] }; tableCards: Card[] }) => void
  round_result: (data: { winnerId: string; scoreCards: Card[]; scores: { id: string; score: number }[] }) => void
  draw_card: (data: { cards: Card[] }) => void
  game_over: (data: { scores: { id: string; totalScore: number }[]; remainingScoreCards: Card[] }) => void
  boxer_start: (data: { scoreCard: Card; participants: string[] }) => void
  boxer_reveal: (data: { moves: Record<string, string> }) => void
  boxer_eliminated: (data: { playerId: string }) => void
  boxer_winner: (data: { playerId: string; scoreCard: Card }) => void
  surrender_swap: (data: { losers: { id: string; gaveUpCard: Card; receivedCard: Card }[] }) => void
  next_game_lead: (data: { playerId: string }) => void
  player_disconnected: (data: { playerId: string }) => void
  player_reconnected: (data: { playerId: string }) => void
  error: (data: { message: string }) => void
  full_state: (data: ServerGame & { myHand: Card[]; myId: string }) => void
}

export interface ClientEvents {
  create_room: (data: { name: string; maxPlayers: number }) => void
  join_room: (data: { roomCode: string; playerName: string }) => void
  ready: () => void
  play: (data: { cards: Card[] }) => void
  pass: () => void
  boxer_move: (data: { move: BoxerMove }) => void
  leave_room: () => void
  reconnect: (data: { roomCode: string; playerId: string }) => void
}
