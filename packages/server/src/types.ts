import type { Card, GamePhase, BoxerMove } from '@79523/engine'

export interface Player {
  id: string
  name: string
  socketId: string
  ready: boolean
  connected: boolean
  isHost: boolean
  wins: number
  boxerWins: number
}

export interface Room {
  code: string
  maxPlayers: number
  players: Player[]
  createdAt: number
  game: ServerGame | null
  nextLeadPlayerId?: string  // From surrender swap, for next game's first trick (Design §4.2)
  surrenderState?: SurrenderState | null
  pendingSurrender?: { winnerIds: string[]; loserIds: string[] }
}

export interface SurrenderState {
  phase: 'losers_give' | 'winners_pick' | 'winners_return'
  sortedPlayerIds: string[]        // sorted by score desc
  winnerIds: string[]              // top 2 (or 1 for <4 players)
  loserIds: string[]               // bottom 2 (or 1 for <4 players)
  currentPairIndex: number         // 0-based, which loser-winner pair is active
  surrenderedCards: { playerId: string; card: Card }[]  // cards given by losers
  pendingPick?: { winnerId: string; card: Card }  // card picked by current winner
  swaps: { loserId: string; winnerId: string; gaveUpCard: Card; receivedCard: Card }[]
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
  isFirstTrick: boolean
  boxerState: BoxerState | null
}

export interface BoxerState {
  scoreCards: Card[]
  currentCardIndex: number
  currentSurvivors: string[]
  currentMoves: Map<string, BoxerMove>
  round: number
}

export interface GamePlayer {
  id: string
  hand: Card[]
  score: number
  totalScore: number
  finished: boolean
  hasBoxerBadge: boolean
  boxerWins: number  // per-game boxer round wins (for champion determination)
}

export interface ServerEvents {
  room_created: (data: { roomCode: string }) => void
  player_joined: (data: { players: { id: string; name: string; ready: boolean; connected: boolean; isHost: boolean; wins: number; boxerWins: number }[] }) => void
  player_left: (data: { playerId: string; players: { id: string; name: string; ready: boolean; connected: boolean; isHost: boolean; wins: number; boxerWins: number }[] }) => void
  players_updated: (data: { players: { id: string; name: string; ready: boolean; connected: boolean; isHost: boolean; wins: number; boxerWins: number }[] }) => void
  game_started: (data: { hand: Card[]; players: GamePlayer[]; leadPlayerId: string; playerNames: Record<string, string>; myId: string; deckCount: number }) => void
  your_turn: (data: { timeout: number; hand: Card[]; deckCount: number }) => void
  play_made: (data: { playerId: string; play: { type: string; cards: Card[] }; tableCards: Card[] }) => void
  pass_made: (data: { playerId: string }) => void
  round_result: (data: { winnerId: string; scoreCards: Card[]; scores: { id: string; score: number }[]; playerHandSizes: { id: string; cardCount: number }[] }) => void
  draw_card: (data: { hand: Card[]; deckCount: number }) => void
  game_over: (data: { scores: { id: string; totalScore: number }[]; remainingScoreCards: Card[] }) => void
  boxer_start: (data: { scoreCard: Card; participants: string[] }) => void
  boxer_reveal: (data: { moves: Record<string, string> }) => void
  boxer_eliminated: (data: { playerId: string }) => void
  boxer_winner: (data: { playerId: string; scoreCard: Card }) => void
  surrender_swap: (data: { losers: { id: string; gaveUpCard: Card; receivedCard: Card }[] }) => void
  surrender_start: (data: { phase: string; yourRole: 'loser' | 'winner' | 'spectator'; hand: Card[]; info: string }) => void
  surrender_update: (data: { phase: string; info: string; surrenderedCards?: { playerId: string; card: Card }[] }) => void
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
  start_new_game: () => void
  surrender_give: (data: { card: Card }) => void      // loser gives largest card
  surrender_pick: (data: { card: Card }) => void      // winner picks from surrendered
  surrender_return: (data: { card: Card }) => void    // winner returns a card
}
