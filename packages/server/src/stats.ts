import { addStats, findUserById } from './db'

export interface GamePlayerStat {
  id: string
  rank1: boolean
  boxerWins: number
}

/** Persist per-account cumulative stats at game end. Non-account ids (AI / deleted) are skipped. */
export function persistGameStats(stats: GamePlayerStat[]): void {
  for (const s of stats) {
    if (!findUserById(s.id)) continue
    addStats(s.id, s.rank1 ? 1 : 0, s.boxerWins)
  }
}
