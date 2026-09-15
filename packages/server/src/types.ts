import type { Card, GamePhase, BoxerMove, Play } from '@79523/engine'

export interface Player {
  id: string
  name: string
  socketId: string
  ready: boolean
  connected: boolean
  isHost: boolean
  wins: number
  boxerWins: number
  isAI?: boolean
}

export interface Room {
  code: string
  maxPlayers: number
  players: Player[]
  createdAt: number
  game: ServerGame | null
  hostId?: string
  gameStartedAt?: number  // wall-clock ms when the current game started (for play-time stats)
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
  currentBestPlay: Play | null
  bestPlayerId: string | null
  passCount: number
  tableCards: Card[]
  /** Who played which table cards (for per-player colours); reset each trick. */
  tablePlays: { playerId: string; cards: Card[] }[]
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
  /** Index of the tied score-group being resolved when the boxer state is reused for ranking tiebreaks. */
  tieGroupIndex?: number
}

export interface GamePlayer {
  id: string
  hand: Card[]
  score: number
  totalScore: number
  finished: boolean
  hasBoxerBadge: boolean
  boxerWins: number  // per-game boxer round wins (for champion determination)
  tiebreakOrder: number  // 0=won tiebreak, 1=lost, etc. For ranking within same score
}

export interface ServerEvents {
  room_created: (data: { roomCode: string }) => void
  player_joined: (data: { players: { id: string; name: string; ready: boolean; connected: boolean; isHost: boolean; wins: number; boxerWins: number; isAI: boolean }[] }) => void
  player_left: (data: { playerId: string; players: { id: string; name: string; ready: boolean; connected: boolean; isHost: boolean; wins: number; boxerWins: number; isAI: boolean }[] }) => void
  players_updated: (data: { players: { id: string; name: string; ready: boolean; connected: boolean; isHost: boolean; wins: number; boxerWins: number; isAI: boolean }[] }) => void
  game_started: (data: { hand: Card[]; players: (GamePlayer & { connected?: boolean })[]; leadPlayerId: string; playerNames: Record<string, string>; myId: string; deckCount: number }) => void
  your_turn: (data: { timeout: number; hand: Card[]; deckCount: number; tableCards?: Card[] }) => void
  play_made: (data: { playerId: string; nextPlayerId: string; play: { type: string; cards: Card[] }; tableCards: Card[] }) => void
  pass_made: (data: { playerId: string; nextPlayerId: string }) => void
  round_result: (data: { winnerId: string; scoreCards: Card[]; scores: { id: string; score: number }[]; playerHandSizes: { id: string; cardCount: number }[] }) => void
  draw_card: (data: { hand: Card[]; deckCount: number }) => void
  game_over: (data: { scores: { id: string; totalScore: number }[]; remainingScoreCards: Card[] }) => void
  boxer_start: (data: { scoreCard: Card | null; participants: string[]; gameScores?: Record<string, number>; boxerWins?: Record<string, number>; spectators?: boolean; submitted?: boolean }) => void
  boxer_reveal: (data: { moves: Record<string, string> }) => void
  boxer_eliminated: (data: { playerId: string }) => void
  boxer_winner: (data: { playerId: string; scoreCard: Card; points?: number; scores?: { id: string; score: number }[] }) => void
  surrender_swap: (data: { losers: { id: string; gaveUpCard: Card; receivedCard: Card }[] }) => void
  surrender_start: (data: { phase: string; yourRole: 'loser' | 'winner' | 'spectator'; hand: Card[]; info: string; surrenderedCards?: { playerId: string; playerName: string; card: Card }[] }) => void
  surrender_update: (data: { phase: string; info: string; surrenderedCards?: { playerId: string; card: Card }[] }) => void
  next_game_lead: (data: { playerId: string }) => void
  player_disconnected: (data: { playerId: string }) => void
  player_reconnected: (data: { playerId: string }) => void
  error: (data: { message: string }) => void
  full_state: (data: ServerGame & { myHand: Card[]; myId: string; roomCode: string; roomPlayerStats?: Record<string, { wins: number; boxerWins: number; connected?: boolean }>; playerNames?: Record<string, string> }) => void
  scores_updated: (data: { scores: { id: string; totalScore: number }[] }) => void
  room_stats_updated: (data: { stats: { id: string; name: string; wins: number; boxerWins: number }[] }) => void
  boxer_champion: (data: { playerId: string; scores: { id: string; score: number }[] }) => void
  boxer_tiebreak: (data: { participants: string[]; info: string; wins?: number }) => void
  lobby_users_updated: (data: { users: { id: string; username: string; role: string; wins: number; boxerWins: number; online: boolean; playSeconds24h: number; wins24h: number; boxerWins24h: number }[] }) => void
  lobby_rooms_updated: (data: { rooms: { code: string; hostId?: string; playerCount: number; maxPlayers: number; inGame: boolean }[] }) => void
}

export interface ClientEvents {
  create_room: () => void
  join_room: (data: { roomCode: string }) => void
  start_game: () => void
  add_ai: () => void
  fill_ai: () => void
  remove_ai: (data: { playerId: string }) => void
  play: (data: { cards: Card[] }) => void
  pass: () => void
  boxer_move: (data: { move: BoxerMove }) => void
  leave_room: () => void
  reconnect: (data: { roomCode: string }) => void
  surrender_give: (data: { card: Card }) => void      // loser gives largest card
  surrender_pick: (data: { card: Card }) => void      // winner picks from surrendered
  surrender_return: (data: { card: Card }) => void    // winner returns a card
}
