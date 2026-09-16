import type { Room, Player } from './types'
import { generateRoomCode } from './utils'
import { removePlayer } from './player'

const rooms = new Map<string, Room>()

export function createRoom(maxPlayers: number): Room {
  let code: string
  do { code = generateRoomCode() } while (rooms.has(code))
  const room: Room = { code, maxPlayers, players: [], createdAt: Date.now(), game: null }
  rooms.set(code, room)
  return room
}

export function getRoom(code: string): Room | undefined { return rooms.get(code) }
export function getAllRooms(): Room[] { return Array.from(rooms.values()) }

export function joinRoom(code: string, player: Player): Room | null {
  const room = rooms.get(code)
  if (!room) return null
  if (room.players.some(p => p.id === player.id)) return room
  // Joining while a game runs is allowed: the seat lands in `room.players` only and takes part
  // from the NEXT game (turn routing needs game.players, so never add to that here). Everything
  // that walks the table must therefore skip seats that aren't in `game.players`.
  if (room.players.length >= room.maxPlayers) return null
  room.players.push(player)
  return room
}

export function leaveRoom(code: string, playerId: string): Room | null {
  const room = rooms.get(code)
  if (!room) return null
  room.players = room.players.filter(p => p.id !== playerId)
  removePlayer(playerId)
  // Last human left — dissolve the room immediately (an AI-only room must not linger), and drop
  // the seats that go with it: otherwise every abandoned room leaks its AI players into the
  // global registry (and their names keep being swallowed) for the life of the process.
  if (!room.players.some(p => !p.isAI)) {
    for (const p of room.players) removePlayer(p.id)
    rooms.delete(code)
    return null
  }
  return room
}

export function destroyRoom(code: string): void {
  const room = rooms.get(code)
  if (!room) return
  for (const p of room.players) removePlayer(p.id)
  rooms.delete(code)
}
export function setRoomGame(code: string, game: Room['game']): void {
  const room = rooms.get(code)
  if (room) room.game = game
}
