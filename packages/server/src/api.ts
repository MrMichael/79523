import { Router } from 'express'
import { createRoom, getAllRooms } from './room'

const router = Router()

router.get('/rooms', (_req, res) => {
  const rooms = getAllRooms().map(r => ({ code: r.code, playerCount: r.players.length, maxPlayers: r.maxPlayers, inGame: r.game !== null }))
  res.json(rooms)
})

router.post('/rooms', (req, res) => {
  const { maxPlayers } = req.body
  const count = Math.min(Math.max(maxPlayers || 4, 2), 6)
  const room = createRoom(count)
  res.json({ roomCode: room.code, maxPlayers: room.maxPlayers })
})

export default router
