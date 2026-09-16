import type { Player } from './types'

const players = new Map<string, Player>()

export function createPlayer(socketId: string, name: string, isHost = false): Player {
  const player: Player = {
    id: socketId.slice(0, 8) + Date.now().toString(36),
    name,
    socketId,
    ready: false,
    connected: true,
    isHost,
    wins: 0,
    boxerWins: 0,
  }
  players.set(player.id, player)
  return player
}

let aiSeq = 0

/**
 * The room is passed (not just its code) so the AI can be numbered within its own table:
 * a fresh room starts at 电脑1 again instead of inheriting a server-wide counter that kept
 * growing for the lifetime of the process (电脑137 …).
 */
export function createAIPlayer(room: { players: Player[] }): Player {
  const taken = new Set(room.players.filter(p => p.isAI).map(p => p.name))
  let n = 1
  while (taken.has(`电脑${n}`)) n++
  aiSeq++
  const player: Player = {
    id: `ai-${aiSeq}-${Date.now().toString(36)}`,
    name: `电脑${n}`,
    socketId: '',
    ready: true,
    connected: true,
    isHost: false,
    isAI: true,
    wins: 0,
    boxerWins: 0,
  }
  players.set(player.id, player)
  return player
}

export function createPlayerForAccount(user: { id: string; username: string }): Player {
  // Reuse the existing object so the global map and room.players never diverge
  // (a second join_room / reconnect must not replace the object a room holds).
  const existing = players.get(user.id)
  if (existing) { existing.name = user.username; return existing }
  const player: Player = {
    id: user.id,
    name: user.username,
    socketId: '',
    ready: false,
    connected: true,
    isHost: false,
    wins: 0,
    boxerWins: 0,
  }
  players.set(player.id, player)
  return player
}

export function getPlayer(id: string): Player | undefined { return players.get(id) }
export function removePlayer(id: string): void { players.delete(id) }

export function setPlayerReady(id: string, ready: boolean): void {
  const player = players.get(id)
  if (player) player.ready = ready
}

export function setPlayerConnected(id: string, connected: boolean): void {
  const player = players.get(id)
  if (player) player.connected = connected
}

export function resetPlayerReady(id: string): void {
  const player = players.get(id)
  if (player) player.ready = false
}
