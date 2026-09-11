import { Router } from 'express'
import { createRoom, getAllRooms, getRoom, destroyRoom } from './room'
import { registerUser, authenticate, signToken, publicUser } from './auth'
import { requireAuth, requireAdmin } from './middleware'
import type { AuthedRequest } from './middleware'
import { listUsers, findUserById, deleteUser, setRole, resetStats, countAdmins, leaderboard } from './db'
import type { Role } from './db'
import { kickUser, kickUserEverywhere, isOnline } from './online'

const router: Router = Router()

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
  res.json(listUsers().map(u => publicUser(u, isOnline(u.id))))
})

router.get('/leaderboard', requireAuth, (req, res) => {
  const metric = req.query.metric === 'boxerWins' ? 'boxerWins' : 'wins'
  res.json(leaderboard(metric).map(u => publicUser(u, isOnline(u.id))))
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

router.post('/admin/kick/:userId', requireAuth, requireAdmin, (req, res) => {
  kickUser(req.params.userId)
  res.json({ ok: true })
})

export default router
