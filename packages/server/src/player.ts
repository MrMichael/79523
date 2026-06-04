import type { Player } from './types'

const players = new Map<string, Player>()

export function createPlayer(socketId: string, name: string): Player {
  const player: Player = {
    id: socketId.slice(0, 8) + Date.now().toString(36),
    name,
    socketId,
    ready: false,
    connected: true,
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
