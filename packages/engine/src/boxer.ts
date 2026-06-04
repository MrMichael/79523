import { BoxerMove } from './types'

const BEATS: Record<BoxerMove, BoxerMove> = {
  [BoxerMove.Rock]: BoxerMove.Scissors,
  [BoxerMove.Scissors]: BoxerMove.Paper,
  [BoxerMove.Paper]: BoxerMove.Rock,
}

export function resolveRound(moves: Map<string, BoxerMove>): string[] {
  const entries = Array.from(moves.entries())
  if (entries.length <= 1) return entries.map(([id]) => id)

  const uniqueMoves = new Set(entries.map(([, m]) => m))
  if (uniqueMoves.size === 3 || uniqueMoves.size === 1) return entries.map(([id]) => id)

  const moveList = Array.from(uniqueMoves)
  const winningMove = BEATS[moveList[0]] === moveList[1] ? moveList[0] : moveList[1]
  return entries.filter(([, m]) => m === winningMove).map(([id]) => id)
}

export function getWinner(survivors: string[]): string {
  if (survivors.length !== 1) throw new Error(`Expected exactly 1 survivor, got ${survivors.length}`)
  return survivors[0]
}
