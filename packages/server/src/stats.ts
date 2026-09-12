import { addStats, findUserById, addGameLog } from './db'

export interface GamePlayerStat {
  id: string
  rank1: boolean
  boxerWins: number
  /** Seconds this account spent in the game; omitted for non-accounts. */
  playSeconds?: number
}

/** Persist per-account cumulative stats at game end. Non-account ids (AI / deleted) are skipped. */
export function persistGameStats(stats: GamePlayerStat[]): void {
  const at = Date.now()
  for (const s of stats) {
    if (!findUserById(s.id)) continue
    const wins = s.rank1 ? 1 : 0
    addStats(s.id, wins, s.boxerWins)
    addGameLog(s.id, at, s.playSeconds ?? 0, wins, s.boxerWins)
  }
}
