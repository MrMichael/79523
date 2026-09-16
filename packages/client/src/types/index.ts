export type { Card, Suit, Rank, HandType, Play, BoxerMove, GamePhase } from '@79523/engine'
import type { Card } from '@79523/engine'

export interface PlayerInfo {
  id: string
  name: string
  ready: boolean
  connected: boolean
  isHost?: boolean
  wins?: number
  boxerWins?: number
  isAI?: boolean
  /** 托管: the server plays this seat (offline seats are managed implicitly). */
  managed?: boolean
  /** false = seated for the next game only (joined while a game was running). */
  playing?: boolean
}

export interface ChatMessage {
  playerId: string
  name: string
  text: string
  at: number
  /** System notice (e.g. "某人上线了") — shown as a bullet, not as someone speaking. */
  system?: boolean
}

export interface UIGameState {
  myHand: Card[]
  tableCards: Card[]
  players: PlayerInfo[]
  currentTurn: string
  scores: Record<string, number>
  deckCount: number
  phase: string
  timeLeft: number
}
