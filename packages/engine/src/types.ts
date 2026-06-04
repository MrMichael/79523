export enum Suit {
  Spade = 0,    // ♠
  Heart = 1,    // ♥
  Club = 2,     // ♣
  Diamond = 3,  // ♦
}

// Higher value = stronger card.
// Order: 4 < 6 < 8 < 10 < J < Q < K < A < 3 < 2 < 5 < 9 < 7
export enum Rank {
  Four = 0,
  Six = 1,
  Eight = 2,
  Ten = 3,
  Jack = 4,
  Queen = 5,
  King = 6,
  Ace = 7,
  Three = 8,
  Two = 9,
  Five = 10,
  Nine = 11,
  Seven = 12,
}

export interface Card {
  suit: Suit
  rank: Rank
}

export enum HandType {
  Single = 'single',
  Pair = 'pair',
  Bike = 'bike',
  Triple = 'triple',
  Root = 'root',
}

export interface Play {
  type: HandType
  cards: Card[]
  primaryRank: Rank
  secondaryRank?: Rank
}

export interface GameError {
  code: 'INVALID_CARDS' | 'WRONG_HAND_TYPE' | 'NOT_YOUR_TURN' | 'GAME_OVER'
  message: string
}

export enum BoxerMove {
  Rock = 'rock',
  Scissors = 'scissors',
  Paper = 'paper',
}

export enum GamePhase {
  Waiting = 'waiting',
  Dealing = 'dealing',
  Playing = 'playing',
  RoundEnd = 'round_end',
  Settling = 'settling',
}

export interface GameState {
  phase: GamePhase
  deck: Card[]
  players: PlayerGameState[]
  currentPlayerIndex: number
  currentBestPlay: Play | null
  bestPlayerId: string | null
  passCount: number
  tableCards: Card[]
  gameOver: boolean
}

export interface PlayerGameState {
  id: string
  hand: Card[]
  score: number
  totalScore: number
  finished: boolean
  hasBoxerBadge: boolean
}
