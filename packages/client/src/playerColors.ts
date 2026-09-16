// Distinct colors assigned per in-game seat so players and their plays are easy to tell apart.
export const PLAYER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4'] as const

export function colorForIndex(index: number): string {
  return PLAYER_COLORS[((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length]
}

/** Stable colour for a player id, so a speaker keeps the same colour wherever their name shows. */
export function colorForId(id: string): string {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return colorForIndex(h)
}
