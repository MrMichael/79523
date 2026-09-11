import { listUsers } from './db'
import { publicUser } from './auth'
import { isOnline, getIO } from './online'
import { getAllRooms } from './room'

/** Push the current lobby state (users + rooms) to all connected clients. */
export function broadcastLobby(): void {
  const io = getIO()
  if (!io) return
  const users = listUsers().map(u => publicUser(u, isOnline(u.id)))
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
