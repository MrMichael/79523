import { Router } from 'express'
import { createRoom, getAllRooms, getRoom, destroyRoom } from './room'
import { registerUser, authenticate, signToken, publicUser } from './auth'
import { requireAuth, requireAdmin } from './middleware'
import type { AuthedRequest } from './middleware'
import { listUsers, findUserById, deleteUser, setRole, resetStats, countAdmins, leaderboard, recentTotals } from './db'
import type { Role, UserRow } from './db'
import { kickUser, kickUserEverywhere, isOnline } from './online'

const router: Router = Router()
const DAY_MS = 24 * 60 * 60 * 1000

// ── auth ──
router.post('/auth/register', (req, res) => {
  try {
    const { username, password } = req.body
    const user = registerUser(username, password)
    res.json({ token: signToken(user), user: publicUser(user) })
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

router.post('/auth/login', (req, res) => {
  const { username, password } = req.body
  const user = authenticate(username, password)
  if (!user) { res.status(401).json({ error: '用户名或密码错误' }); return }
  res.json({ token: signToken(user), user: publicUser(user) })
})

router.get('/auth/me', requireAuth, (req: AuthedRequest, res) => {
  res.json(publicUser(req.user!))
})

router.delete('/auth/me', requireAuth, (req: AuthedRequest, res) => {
  const id = req.user!.id
  kickUserEverywhere(id)
  deleteUser(id)
  res.json({ ok: true })
})

// ── lobby ──
router.get('/users', requireAuth, (_req, res) => {
  const recent = recentTotals(Date.now() - DAY_MS)
  res.json(listUsers().map(u => publicUser(u, isOnline(u.id), recent.get(u.id))))
})

router.get('/leaderboard', requireAuth, (req, res) => {
  const recent = recentTotals(Date.now() - DAY_MS)
  const withRecent = (u: UserRow) => publicUser(u, isOnline(u.id), recent.get(u.id))
  // 24h board ranks by wins earned in the last 24h.
  if (req.query.metric === 'wins24h') {
    res.json(listUsers().map(withRecent).sort((a, b) => b.wins24h - a.wins24h || b.boxerWins24h - a.boxerWins24h))
    return
  }
  const metric = req.query.metric === 'boxerWins' ? 'boxerWins' : 'wins'
  res.json(leaderboard(metric).map(withRecent))
})

router.get('/rooms', requireAuth, (_req, res) => {
  res.json(
    getAllRooms()
      .filter(r => r.players.some(p => !p.isAI))
      .map(r => ({
        code: r.code,
        hostId: r.hostId,
        playerCount: r.players.filter(p => !p.isAI).length,
        maxPlayers: r.maxPlayers,
        inGame: r.game !== null,
      }))
  )
})

router.get('/rooms/:code', requireAuth, (req, res) => {
  const room = getRoom(req.params.code)
  if (!room) { res.status(404).json({ error: '房间不存在' }); return }
  res.json({
    code: room.code,
    hostId: room.hostId,
    maxPlayers: room.maxPlayers,
    inGame: room.game !== null,
    players: room.players.map(p => ({
      id: p.id, name: p.name, ready: p.ready, connected: p.connected,
      isHost: p.isHost, isAI: !!p.isAI, wins: p.wins, boxerWins: p.boxerWins,
    })),
  })
})

router.post('/rooms', requireAuth, (req: AuthedRequest, res) => {
  const room = createRoom(6)
  room.hostId = req.user!.id
  res.json({ roomCode: room.code, maxPlayers: room.maxPlayers })
})

// ── admin ──
router.get('/admin/users', requireAuth, requireAdmin, (_req, res) => {
  res.json(listUsers().map(u => publicUser(u)))
})

router.delete('/admin/users/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
  if (req.params.id === req.user!.id) { res.status(400).json({ error: '不能删除自己' }); return }
  const target = findUserById(req.params.id)
  if (!target) { res.status(404).json({ error: '用户不存在' }); return }
  if (target.role === 'admin' && countAdmins() <= 1) { res.status(400).json({ error: '至少保留一个管理员' }); return }
  kickUser(req.params.id)
  deleteUser(req.params.id)
  res.json({ ok: true })
})

router.post('/admin/users/:id/reset', requireAuth, requireAdmin, (req, res) => {
  resetStats(req.params.id)
  res.json({ ok: true })
})

router.put('/admin/users/:id/role', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
  const role = req.body.role as Role
  if (role !== 'admin' && role !== 'user') { res.status(400).json({ error: 'bad role' }); return }
  if (req.params.id === req.user!.id) { res.status(400).json({ error: '不能修改自己的角色' }); return }
  if (role === 'user') {
    const target = findUserById(req.params.id)
    if (target?.role === 'admin' && countAdmins() <= 1) { res.status(400).json({ error: '至少保留一个管理员' }); return }
  }
  setRole(req.params.id, role)
  res.json({ ok: true })
})

router.delete('/admin/rooms/:code', requireAuth, requireAdmin, (req, res) => {
  const room = getRoom(req.params.code)
  if (room) destroyRoom(room.code)
  res.json({ ok: true })
})

export default router
