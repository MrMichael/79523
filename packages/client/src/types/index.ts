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
