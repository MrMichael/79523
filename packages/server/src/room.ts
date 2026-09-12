import type { Room, Player } from './types'
import { generateRoomCode } from './utils'
import { removePlayer } from './player'

const rooms = new Map<string, Room>()

export function createRoom(maxPlayers: number): Room {
  let code: string
  do { code = generateRoomCode() } while (rooms.has(code))
  const room: Room = { code, maxPlayers, players: [], createdAt: Date.now(), game: null, emptiedAt: 0 }
  rooms.set(code, room)
  return room
}

export function getRoom(code: string): Room | undefined { return rooms.get(code) }
export function getAllRooms(): Room[] { return Array.from(rooms.values()) }

export function joinRoom(code: string, player: Player): Room | null {
  const room = rooms.get(code)
  if (!room) return null
  if (room.players.some(p => p.id === player.id)) return room
  // No joining mid-game: a seat added now wouldn't be in game.players, which breaks
  // turn routing. Reconnecting players restore their existing seat instead.
  if (room.game) return null
  if (room.players.length >= room.maxPlayers) return null
  room.players.push(player)
  return room
}

export function leaveRoom(code: string, playerId: string): Room | null {
  const room = rooms.get(code)
  if (!room) return null
  room.players = room.players.filter(p => p.id !== playerId)
  removePlayer(playerId)
  // Retain the room for a grace period; cleaned after 10 minutes of having no humans.
  if (!room.players.some(p => !p.isAI)) room.emptiedAt = Date.now()
  return room
}

export function destroyRoom(code: string): void { rooms.delete(code) }
export function setRoomGame(code: string, game: Room['game']): void {
  const room = rooms.get(code)
  if (room) room.game = game
}

export function cleanupStaleRooms(now: number = Date.now()): void {
  for (const [code, room] of rooms) {
    const empty = !room.players.some(p => !p.isAI)
    if (empty && room.emptiedAt && now - room.emptiedAt > 10 * 60 * 1000) rooms.delete(code)
  }
}
