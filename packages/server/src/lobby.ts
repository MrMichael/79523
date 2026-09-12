import { listUsers, recentTotals } from './db'
import { publicUser } from './auth'
import { isOnline, getIO } from './online'
import { getAllRooms } from './room'

const DAY_MS = 24 * 60 * 60 * 1000

/** Push the current lobby state (users + rooms) to all connected clients. */
export function broadcastLobby(): void {
  const io = getIO()
  if (!io) return
  const recent = recentTotals(Date.now() - DAY_MS)
  const users = listUsers().map(u => publicUser(u, isOnline(u.id), recent.get(u.id)))
  const rooms = getAllRooms()
    .filter(r => r.players.some(p => !p.isAI))
    .map(r => ({
      code: r.code,
      hostId: r.hostId,
      playerCount: r.players.filter(p => !p.isAI).length,
      maxPlayers: r.maxPlayers,
      inGame: r.game !== null,
    }))
  io.emit('lobby_users_updated', { users })
  io.emit('lobby_rooms_updated', { rooms })
}
