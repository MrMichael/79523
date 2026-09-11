# 账号体系 / 大厅 / 持久化 / 全局排名 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引入强制登录的账号体系（含管理员）、SQLite 持久化战绩、全局排名、以及带用户/房间列表的大厅；同时把房间流程改为"固定 6 人、任意玩家开局、≥2 人即开、空置 10 分钟清理"。

**Architecture:** 服务端新增薄数据层（`better-sqlite3`）与鉴权层（bcryptjs 存密码、JWT 签发令牌，REST 用 `Authorization` 中间件、Socket.IO 用握手 `auth` 中间件）。房间仍留内存，玩家 id 改为账号 id。前端新增 `auth` store 与登录页 / 大厅页，路由守卫强制登录。

**Tech Stack:** Express 4, Socket.IO 4, better-sqlite3, bcryptjs, jsonwebtoken, tsx (server)；Vue 3 + Pinia + vue-router (client)；Vitest / Jest。

**Spec:** `docs/superpowers/specs/2026-09-11-accounts-lobby-design.md`

## Global Constraints

- 包管理/测试：`npx pnpm`；`npx pnpm test`（engine+server+client）、`test:engine`、`test:server`、`test:client`。
- server 测试：`cd packages/server && npx jest --forceExit`；类型检查 `npx tsc --noEmit`。
- client 类型检查：`cd packages/client && npx vue-tsc --noEmit`；构建 `npx vite build`。
- 数据库文件 `packages/server/data/app.db`；`data/` 必须加入 `.gitignore`。
- 管理员由环境变量 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 在启动时 seed；密码用 bcrypt 哈希；令牌 JWT 7 天，payload `{ uid, role }`。
- 对外用户对象**永不含 `password_hash`**。
- 房间容量固定 **6**；**取消 ready**；任意房间内玩家可 `start_game`（`players.length >= 2 && room.game == null`）。
- 空置房（无真人）保留 **10 分钟**后清理，计时基于 `Room.emptiedAt`。
- AI 玩家不计入持久化与全局排名。
- 现有行为不回归：`game-machine` / `game-simulation` / `room` 单测保持绿色。

---

## Phase 1 — 数据层与鉴权（server）

### Task 1: 依赖 + SQLite 数据层 + 管理员 seed

**Files:**
- Modify: `packages/server/package.json`（新增依赖）
- Modify: `.gitignore`（新增 `data/`）
- Create: `packages/server/src/db.ts`
- Test: `packages/server/src/__tests__/db.test.ts`

**Interfaces:**
- Produces:
  - `interface UserRow { id: string; username: string; password_hash: string; role: 'admin' | 'user'; wins: number; boxer_wins: number; created_at: number }`
  - `initDb(): void`（建表 + seed admin；幂等）
  - `createUser(username: string, passwordHash: string, role?: 'admin'|'user'): UserRow`
  - `findUserByUsername(username: string): UserRow | undefined`
  - `findUserById(id: string): UserRow | undefined`
  - `listUsers(): UserRow[]`
  - `deleteUser(id: string): void`
  - `setRole(id: string, role: 'admin'|'user'): void`
  - `resetStats(id: string): void`
  - `addStats(id: string, wins: number, boxerWins: number): void`
  - `leaderboard(metric: 'wins'|'boxerWins'): UserRow[]`
  - `countAdmins(): number`

- [ ] **Step 1: 安装依赖**

Run:
```bash
cd packages/server && npx pnpm add better-sqlite3 bcryptjs jsonwebtoken && npx pnpm add -D @types/better-sqlite3 @types/bcryptjs @types/jsonwebtoken
```

- [ ] **Step 2: `.gitignore` 增加 data 目录**

在根 `.gitignore` 追加一行：
```
data/
```

- [ ] **Step 3: 写失败测试**

Create `packages/server/src/__tests__/db.test.ts`:
```ts
import { describe, test, expect, beforeEach } from '@jest/globals'

// Use an in-memory DB for tests.
process.env.DB_PATH = ':memory:'

import { initDb, createUser, findUserByUsername, findUserById, listUsers, deleteUser, setRole, resetStats, addStats, leaderboard, countAdmins } from '../db'

describe('db layer', () => {
  beforeEach(() => { initDb() })

  test('create + find user', () => {
    const u = createUser('alice', 'hash')
    expect(u.username).toBe('alice')
    expect(u.role).toBe('user')
    expect(findUserByUsername('alice')!.id).toBe(u.id)
    expect(findUserById(u.id)!.username).toBe('alice')
  })

  test('username is unique', () => {
    createUser('bob', 'h')
    expect(() => createUser('bob', 'h')).toThrow()
  })

  test('stats + leaderboard', () => {
    const a = createUser('a', 'h')
    const b = createUser('b', 'h')
    addStats(a.id, 3, 1)
    addStats(b.id, 1, 5)
    expect(leaderboard('wins').map(u => u.username)).toEqual(['a', 'b'])
    expect(leaderboard('boxerWins').map(u => u.username)).toEqual(['b', 'a'])
  })

  test('reset + role + delete + countAdmins', () => {
    const a = createUser('a', 'h')
    addStats(a.id, 4, 4)
    resetStats(a.id)
    expect(findUserById(a.id)!.wins).toBe(0)
    setRole(a.id, 'admin')
    expect(findUserById(a.id)!.role).toBe('admin')
    expect(countAdmins()).toBe(1)
    deleteUser(a.id)
    expect(findUserById(a.id)).toBeUndefined()
    expect(listUsers()).toHaveLength(0)
  })
})
```

- [ ] **Step 4: 运行测试确认失败**

Run: `cd packages/server && npx jest db --forceExit`
Expected: FAIL（`../db` 不存在）。

- [ ] **Step 5: 实现 `db.ts`**

Create `packages/server/src/db.ts`:
```ts
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { mkdirSync } from 'fs'
import { dirname, resolve } from 'path'

export type Role = 'admin' | 'user'

export interface UserRow {
  id: string
  username: string
  password_hash: string
  role: Role
  wins: number
  boxer_wins: number
  created_at: number
}

const DB_PATH = process.env.DB_PATH || resolve(process.cwd(), 'data/app.db')
if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new Database(DB_PATH)

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      wins INTEGER NOT NULL DEFAULT 0,
      boxer_wins INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `)
  // Seed admin from env if configured and missing.
  const username = process.env.ADMIN_USERNAME
  const password = process.env.ADMIN_PASSWORD
  if (username && password && !findUserByUsername(username)) {
    // Seed admin directly with a bcrypt hash (the normal path is auth.ts).
    const hash = bcrypt.hashSync(password, 10)
    createUser(username, hash, 'admin')
  }
  if (countAdmins() === 0) {
    console.warn('[db] no admin account exists — set ADMIN_USERNAME/ADMIN_PASSWORD to seed one')
  }
}

export function createUser(username: string, passwordHash: string, role: Role = 'user'): UserRow {
  const row: UserRow = { id: randomUUID(), username, password_hash: passwordHash, role, wins: 0, boxer_wins: 0, created_at: Date.now() }
  db.prepare('INSERT INTO users (id, username, password_hash, role, wins, boxer_wins, created_at) VALUES (@id,@username,@password_hash,@role,@wins,@boxer_wins,@created_at)').run(row)
  return row
}

export function findUserByUsername(username: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined
}
export function findUserById(id: string): UserRow | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
}
export function listUsers(): UserRow[] {
  return db.prepare('SELECT * FROM users ORDER BY created_at ASC').all() as UserRow[]
}
export function deleteUser(id: string): void { db.prepare('DELETE FROM users WHERE id = ?').run(id) }
export function setRole(id: string, role: Role): void { db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id) }
export function resetStats(id: string): void { db.prepare('UPDATE users SET wins = 0, boxer_wins = 0 WHERE id = ?').run(id) }
export function addStats(id: string, wins: number, boxerWins: number): void {
  db.prepare('UPDATE users SET wins = wins + ?, boxer_wins = boxer_wins + ? WHERE id = ?').run(wins, boxerWins, id)
}
export function leaderboard(metric: 'wins' | 'boxerWins'): UserRow[] {
  const order = metric === 'boxerWins' ? 'boxer_wins DESC, wins DESC' : 'wins DESC, boxer_wins DESC'
  return db.prepare(`SELECT * FROM users ORDER BY ${order}`).all() as UserRow[]
}
export function countAdmins(): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number }).n
}
```
> 注：`seed` 直接使用顶部 `import bcrypt from 'bcryptjs'`（服务端为 ESM，不能用 `require`）。

- [ ] **Step 6: 运行测试确认通过**

Run: `cd packages/server && npx jest db --forceExit`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add packages/server/package.json packages/server/src/db.ts packages/server/src/__tests__/db.test.ts .gitignore ../pnpm-lock.yaml
git commit -m "feat(server): SQLite data layer + admin seed"
```

---

### Task 2: 密码哈希 + JWT + 用户服务

**Files:**
- Create: `packages/server/src/auth.ts`
- Test: `packages/server/src/__tests__/auth.test.ts`

**Interfaces:**
- Consumes: `db.ts`（Task 1）。
- Produces:
  - `hashPassword(pw: string): string`
  - `verifyPassword(pw: string, hash: string): boolean`
  - `signToken(user: { id: string; role: Role }): string`
  - `verifyToken(token: string): { uid: string; role: Role } | null`
  - `publicUser(u: UserRow, online?: boolean): { id; username; role; wins; boxerWins; online }`
  - `registerUser(username, password): UserRow`（校验用户名/密码格式 + 唯一）
  - `authenticate(username, password): UserRow | null`

- [ ] **Step 1: 写失败测试**

Create `packages/server/src/__tests__/auth.test.ts`:
```ts
import { describe, test, expect, beforeEach } from '@jest/globals'
process.env.DB_PATH = ':memory:'
import { initDb } from '../db'
import { hashPassword, verifyPassword, signToken, verifyToken, registerUser, authenticate, publicUser } from '../auth'

describe('auth', () => {
  beforeEach(() => initDb())

  test('password hash roundtrip', () => {
    const h = hashPassword('secret123')
    expect(h).not.toBe('secret123')
    expect(verifyPassword('secret123', h)).toBe(true)
    expect(verifyPassword('wrong', h)).toBe(false)
  })

  test('token roundtrip', () => {
    const t = signToken({ id: 'u1', role: 'admin' })
    expect(verifyToken(t)).toEqual({ uid: 'u1', role: 'admin' })
    expect(verifyToken('garbage')).toBeNull()
  })

  test('register validation + uniqueness', () => {
    expect(() => registerUser('ab', 'secret123')).toThrow()         // username too short
    expect(() => registerUser('bob', '123')).toThrow()              // password too short
    registerUser('bob', 'secret123')
    expect(() => registerUser('bob', 'secret123')).toThrow()        // duplicate
  })

  test('authenticate', () => {
    registerUser('bob', 'secret123')
    expect(authenticate('bob', 'secret123')!.username).toBe('bob')
    expect(authenticate('bob', 'nope')).toBeNull()
    expect(authenticate('ghost', 'secret123')).toBeNull()
  })

  test('publicUser hides hash', () => {
    const u = registerUser('bob', 'secret123')
    const p = publicUser(u, true)
    expect(p).not.toHaveProperty('password_hash')
    expect(p).toMatchObject({ username: 'bob', online: true })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd packages/server && npx jest auth --forceExit`
Expected: FAIL。

- [ ] **Step 3: 实现 `auth.ts`**

Create `packages/server/src/auth.ts`:
```ts
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { createUser, findUserByUsername } from './db'
import type { Role, UserRow } from './db'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const TOKEN_TTL = '7d'
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/

export function hashPassword(pw: string): string { return bcrypt.hashSync(pw, 10) }
export function verifyPassword(pw: string, hash: string): boolean { return bcrypt.compareSync(pw, hash) }

export function signToken(user: { id: string; role: Role }): string {
  return jwt.sign({ uid: user.id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL })
}
export function verifyToken(token: string): { uid: string; role: Role } | null {
  try {
    const p = jwt.verify(token, JWT_SECRET) as { uid: string; role: Role }
    return { uid: p.uid, role: p.role }
  } catch { return null }
}

export function publicUser(u: UserRow, online = false) {
  return { id: u.id, username: u.username, role: u.role, wins: u.wins, boxerWins: u.boxer_wins, online }
}

export function registerUser(username: string, password: string): UserRow {
  if (!USERNAME_RE.test(username)) throw new Error('用户名需为 3-20 位字母/数字/下划线')
  if (password.length < 6) throw new Error('密码至少 6 位')
  if (findUserByUsername(username)) throw new Error('用户名已存在')
  return createUser(username, hashPassword(password))
}

export function authenticate(username: string, password: string): UserRow | null {
  const u = findUserByUsername(username)
  if (!u || !verifyPassword(password, u.password_hash)) return null
  return u
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd packages/server && npx jest auth --forceExit`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth.ts packages/server/src/__tests__/auth.test.ts
git commit -m "feat(server): password hashing + JWT user service"
```

---

### Task 3: REST 鉴权中间件 + auth/admin 路由

**Files:**
- Create: `packages/server/src/middleware.ts`
- Modify: `packages/server/src/api.ts`
- Modify: `packages/server/src/index.ts`（启动时 `initDb()`）
- Test: `packages/server/src/__tests__/api-auth.test.ts`

**Interfaces:**
- Consumes: `db.ts`, `auth.ts`, `room.ts`。
- Produces: `requireAuth(req,res,next)`、`requireAdmin(req,res,next)`；REST 路由（见下）。

- [ ] **Step 1: 写失败测试**

Create `packages/server/src/__tests__/api-auth.test.ts`:
```ts
import { describe, test, expect, beforeEach } from '@jest/globals'
import { createServer } from 'http'
import express from 'express'
process.env.DB_PATH = ':memory:'
import { initDb } from '../db'
import { registerUser } from '../auth'
import apiRoutes from '../api'

async function withServer(fn: (base: string) => Promise<void>) {
  const app = express(); app.use(express.json()); app.use('/api', apiRoutes)
  const srv = createServer(app)
  await new Promise<void>(r => srv.listen(0, r))
  const { port } = srv.address() as any
  try { await fn(`http://localhost:${port}`) } finally { await new Promise<void>(r => srv.close(() => r())) }
}

describe('auth REST', () => {
  beforeEach(() => initDb())

  test('register + login + me', async () => {
    await withServer(async base => {
      const r = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'alice', password: 'secret123' }) })
      expect(r.status).toBe(200)
      const { token } = await r.json() as any
      const me = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${token}` } })
      expect((await me.json() as any).username).toBe('alice')
    })
  })

  test('me without token is 401', async () => {
    await withServer(async base => {
      expect((await fetch(`${base}/api/auth/me`)).status).toBe(401)
    })
  })

  test('admin route rejects normal user, allows admin', async () => {
    await withServer(async base => {
      registerUser('admin', 'secret123')
      const { setRole, findUserByUsername } = await import('../db')
      setRole(findUserByUsername('admin')!.id, 'admin')
      const login = async (u: string) => (await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: u, password: 'secret123' }) })).json() as any).token
      registerUser('bob', 'secret123')
      expect((await fetch(`${base}/api/admin/users`, { headers: { authorization: `Bearer ${await login('bob')}` } })).status).toBe(403)
      const list = await fetch(`${base}/api/admin/users`, { headers: { authorization: `Bearer ${await login('admin')}` } })
      expect(list.status).toBe(200)
      expect((await list.json() as any[]).length).toBe(2)
    })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd packages/server && npx jest api-auth --forceExit`
Expected: FAIL。

- [ ] **Step 3: 实现 `middleware.ts`**

Create `packages/server/src/middleware.ts`:
```ts
import type { Request, Response, NextFunction } from 'express'
import { verifyToken } from './auth'
import { findUserById } from './db'
import type { UserRow } from './db'

export interface AuthedRequest extends Request { user?: UserRow }

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const payload = token ? verifyToken(token) : null
  if (!payload) { res.status(401).json({ error: 'unauthorized' }); return }
  const user = findUserById(payload.uid)
  if (!user) { res.status(401).json({ error: 'unauthorized' }); return }
  req.user = user
  next()
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user) { res.status(401).json({ error: 'unauthorized' }); return }
  if (req.user.role !== 'admin') { res.status(403).json({ error: 'forbidden' }); return }
  next()
}
```

- [ ] **Step 4: 实现 REST 路由**

Replace `packages/server/src/api.ts` with:
```ts
import { Router } from 'express'
import { createRoom, getAllRooms, getRoom, destroyRoom } from './room'
import { registerUser, authenticate, signToken, publicUser } from './auth'
import { requireAuth, requireAdmin } from './middleware'
import type { AuthedRequest } from './middleware'
import { listUsers, findUserById, deleteUser, setRole, resetStats, countAdmins, leaderboard } from './db'
import { kickUser, kickUserEverywhere } from './online'
import type { Role } from './db'

const router: Router = Router()

// ── auth ──
router.post('/auth/register', (req, res) => {
  try {
    const { username, password } = req.body
    const user = registerUser(username, password)
    res.json({ token: signToken(user), user: publicUser(user) })
  } catch (e: any) { res.status(400).json({ error: e.message }) }
})
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body
  const user = authenticate(username, password)
  if (!user) { res.status(401).json({ error: '用户名或密码错误' }); return }
  res.json({ token: signToken(user), user: publicUser(user) })
})
router.get('/auth/me', requireAuth, (req: AuthedRequest, res) => res.json(publicUser(req.user!)))
router.delete('/auth/me', requireAuth, (req: AuthedRequest, res) => {
  kickUserEverywhere(req.user!.id)
  deleteUser(req.user!.id)
  res.json({ ok: true })
})

// ── lobby ──
router.get('/users', requireAuth, (_req, res) => res.json(listUsers().map(u => publicUser(u))))
router.get('/leaderboard', requireAuth, (req, res) => {
  const metric = req.query.metric === 'boxerWins' ? 'boxerWins' : 'wins'
  res.json(leaderboard(metric).map(u => publicUser(u)))
})
router.get('/rooms', requireAuth, (_req, res) => {
  res.json(getAllRooms().filter(r => r.players.some(p => !p.isAI)).map(r => ({
    code: r.code, hostId: r.hostId, playerCount: r.players.filter(p => !p.isAI).length,
    maxPlayers: r.maxPlayers, inGame: r.game !== null,
  })))
})
router.post('/rooms', requireAuth, (req: AuthedRequest, res) => {
  const room = createRoom(6)
  room.hostId = req.user!.id
  res.json({ roomCode: room.code, maxPlayers: room.maxPlayers })
})

// ── admin ──
router.get('/admin/users', requireAuth, requireAdmin, (_req, res) => res.json(listUsers().map(u => publicUser(u))))
router.delete('/admin/users/:id', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
  if (req.params.id === req.user!.id) { res.status(400).json({ error: '不能删除自己' }); return }
  const target = findUserById(req.params.id)
  if (!target) { res.status(404).json({ error: '用户不存在' }); return }
  if (target.role === 'admin' && countAdmins() <= 1) { res.status(400).json({ error: '至少保留一个管理员' }); return }
  kickUser(req.params.id); deleteUser(req.params.id)
  res.json({ ok: true })
})
router.post('/admin/users/:id/reset', requireAuth, requireAdmin, (req, res) => { resetStats(req.params.id); res.json({ ok: true }) })
router.put('/admin/users/:id/role', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
  const role = req.body.role as Role
  if (role !== 'admin' && role !== 'user') { res.status(400).json({ error: 'bad role' }); return }
  if (req.params.id === req.user!.id) { res.status(400).json({ error: '不能修改自己的角色' }); return }
  if (role === 'user') {
    const target = findUserById(req.params.id)
    if (target?.role === 'admin' && countAdmins() <= 1) { res.status(400).json({ error: '至少保留一个管理员' }); return }
  }
  setRole(req.params.id, role); res.json({ ok: true })
})
router.delete('/admin/rooms/:code', requireAuth, requireAdmin, (req, res) => {
  const room = getRoom(req.params.code)
  if (room) destroyRoom(room.code)
  res.json({ ok: true })
})
router.post('/admin/kick/:userId', requireAuth, requireAdmin, (req, res) => { kickUser(req.params.userId); res.json({ ok: true }) })

export default router
```

- [ ] **Step 5: 实现在线登记 `online.ts`**

Create `packages/server/src/online.ts`:
```ts
import type { Server } from 'socket.io'
import type { ClientEvents, ServerEvents } from './types'

let ioRef: Server<ClientEvents, ServerEvents> | null = null
const socketsByUser = new Map<string, Set<string>>()

export function bindOnline(io: Server<ClientEvents, ServerEvents>) { ioRef = io }
export function isOnline(userId: string): boolean { return (socketsByUser.get(userId)?.size ?? 0) > 0 }

export function markOnline(userId: string, socketId: string) {
  const set = socketsByUser.get(userId) || new Set<string>()
  set.add(socketId); socketsByUser.set(userId, set)
}
export function markOffline(userId: string, socketId: string) {
  const set = socketsByUser.get(userId); if (!set) return
  set.delete(socketId); if (set.size === 0) socketsByUser.delete(userId)
}

export function kickUser(userId: string) {
  const set = socketsByUser.get(userId); if (!set || !ioRef) return
  for (const sid of set) ioRef.sockets.sockets.get(sid)?.disconnect(true)
}
export function kickUserEverywhere(userId: string) { kickUser(userId) }
```

- [ ] **Step 6: `index.ts` 启动时初始化 DB**

在 `packages/server/src/index.ts` 顶部 import 并调用：
```ts
import { initDb } from './db'
initDb()
```
（放在 `setupWebSocket(httpServer)` 之前。）

- [ ] **Step 7: 运行测试 + 类型检查**

Run: `cd packages/server && npx jest api-auth --forceExit && npx tsc --noEmit`
Expected: PASS / exit 0。

- [ ] **Step 8: Commit**

```bash
git add packages/server/src/middleware.ts packages/server/src/online.ts packages/server/src/api.ts packages/server/src/index.ts packages/server/src/__tests__/api-auth.test.ts
git commit -m "feat(server): auth/admin/lobby REST routes + middleware"
```

---

### Task 4: Socket 握手鉴权 + 账号身份

**Files:**
- Modify: `packages/server/src/types.ts`（`Player` 保持，新增 `Room.hostId`；`ClientEvents` 增 `start_game`，删 `ready`/`start_new_game`）
- Modify: `packages/server/src/player.ts`（`createPlayerForAccount`）
- Modify: `packages/server/src/ws.ts`（`io.use` 鉴权、在线登记、用账号身份建房/入房）
- Test: `packages/server/src/__tests__/ws-auth.test.ts`

**Interfaces:**
- Consumes: `auth.ts`, `db.ts`, `online.ts`。
- Produces: 已鉴权 socket 的 `socket.data.user = { id, username, role }`；`createPlayerForAccount(user: UserRow): Player`。

- [ ] **Step 1: 写失败测试**

Create `packages/server/src/__tests__/ws-auth.test.ts`:
```ts
import { describe, test, expect, beforeEach } from '@jest/globals'
import { createServer } from 'http'
import { io as ioc } from 'socket.io-client'
process.env.DB_PATH = ':memory:'
import { initDb } from '../db'
import { registerUser, signToken } from '../auth'
import { setupWebSocket } from '../ws'

let srv: any, url = ''
beforeEach(async () => {
  initDb()
  srv = createServer(); setupWebSocket(srv)
  await new Promise<void>(r => srv.listen(0, r))
  url = `http://localhost:${srv.address().port}`
})

function waitFor(s: any, evt: string, t = 4000) {
  return new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${evt}`)), t)
    s.once(evt, (d: any) => { clearTimeout(timer); resolve(d) })
  })
}

describe('socket auth', () => {
  test('connection without token is rejected', async () => {
    const s = ioc(url, { transports: ['websocket'], forceNew: true })
    const err = await new Promise<string>(resolve => s.on('connect_error', (e: any) => resolve(e.message)))
    expect(err).toMatch(/unauthorized/i)
    s.disconnect()
  })

  test('authed socket can create a room', async () => {
    const u = registerUser('alice', 'secret123')
    const s = ioc(url, { transports: ['websocket'], forceNew: true, auth: { token: signToken(u) } })
    await waitFor(s, 'connect')
    s.emit('create_room', {})
    const { roomCode } = await waitFor(s, 'room_created')
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/)
    s.disconnect()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd packages/server && npx jest ws-auth --forceExit`
Expected: FAIL。

- [ ] **Step 3: 类型与玩家工厂**

`packages/server/src/types.ts`：
- `Room` 增加 `hostId?: string`；`Player` 增加 `isAI?: boolean`（已存在）。
- `ClientEvents`：删除 `ready`/`start_new_game`；新增 `start_game: () => void`。
- `create_room` 载荷改为 `{}`（不再要 maxPlayers/name）。

`packages/server/src/player.ts` 增加：
```ts
export function createPlayerForAccount(user: { id: string; username: string }): Player {
  return { id: user.id, name: user.username, socketId: '', ready: true, connected: true, isHost: false, wins: 0, boxerWins: 0 }
}
```

- [ ] **Step 4: `ws.ts` 握手鉴权 + 身份**

在 `setupWebSocket` 里、`io.on('connection')` 之前：
```ts
io.use((socket, next) => {
  const token = (socket.handshake.auth as any)?.token
  const payload = token ? verifyToken(token) : null
  if (!payload) return next(new Error('unauthorized'))
  const user = findUserById(payload.uid)
  if (!user) return next(new Error('unauthorized'))
  socket.data.user = { id: user.id, username: user.username, role: user.role }
  next()
})
bindOnline(io)
```
连接回调内：
```ts
io.on('connection', (socket) => {
  const me = socket.data.user as { id: string; username: string; role: string }
  markOnline(me.id, socket.id)
  socket.on('disconnect', () => markOffline(me.id, socket.id))
  // 用 `me.id` 作为玩家 id；`currentPlayerId` 改为 `me.id`
})
```
把 `create_room` 改为：
```ts
socket.on('create_room', () => {
  const room = createRoom(6)
  room.hostId = me.id
  const player = createPlayerForAccount(me); player.isHost = true; player.socketId = socket.id
  player.socketId = socket.id
  joinRoom(room.code, player)
  socket.join(room.code)
  socket.emit('room_created', { roomCode: room.code })
})
```
`join_room` 用 `createPlayerForAccount(me)`；`reconnect` 不再需要客户端传 `playerId`（用 `me.id`）。

- [ ] **Step 5: 运行测试 + 全量 + 类型检查**

Run: `cd packages/server && npx tsc --noEmit && npx jest --forceExit`
Expected: 新测试 PASS；`ws-integration.test.ts` 等**旧用例此刻会因鉴权而失败**——由 Task 11 统一更新，暂不阻塞本 Task 的新测试。

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/types.ts packages/server/src/player.ts packages/server/src/ws.ts packages/server/src/__tests__/ws-auth.test.ts
git commit -m "feat(server): socket handshake auth + account identity"
```

---

## Phase 2 — 房间流程改造

### Task 5: 固定 6 人 / 取消 ready / 任意玩家开局 / 空置清理

**Files:**
- Modify: `packages/server/src/room.ts`（`emptiedAt` + `cleanupStaleRooms` 基于 emptiedAt）
- Modify: `packages/server/src/ws.ts`（删除 ready/自动开局；新增 `start_game`；空置判定；大厅广播）
- Modify: `packages/server/src/index.ts`（启动 `setInterval(cleanupStaleRooms, 60_000)`）
- Test: `packages/server/src/__tests__/room-lifecycle.test.ts`

**Interfaces:**
- Produces: `start_game` 事件；`cleanupStaleRooms()` 基于 `Room.emptiedAt`。

- [ ] **Step 1: 写失败测试**

Create `packages/server/src/__tests__/room-lifecycle.test.ts`:
```ts
import { describe, test, expect, beforeEach } from '@jest/globals'
import { createRoom, joinRoom, leaveRoom, getRoom, cleanupStaleRooms } from '../room'
import { createPlayerForAccount } from '../player'

describe('room lifecycle', () => {
  beforeEach(() => { /* rooms map is module-global; unique codes each test */ })

  test('room with no humans is retained then cleaned after 10min', () => {
    const room = createRoom(6)
    joinRoom(room.code, createPlayerForAccount({ id: 'u1', username: 'a' }))
    leaveRoom(room.code, 'u1')
    const afterLeave = getRoom(room.code)
    expect(afterLeave).toBeDefined()                 // retained (not deleted immediately)
    expect(afterLeave!.emptiedAt).toBeGreaterThan(0)
    ;(afterLeave as any).emptiedAt = Date.now() - 11 * 60 * 1000
    cleanupStaleRooms()
    expect(getRoom(room.code)).toBeUndefined()
  })

  test('room with only AI is treated as empty', () => {
    const room = createRoom(6)
    const ai = createPlayerForAccount({ id: 'ai1', username: '电脑1' }); ai.isAI = true
    joinRoom(room.code, ai)
    cleanupStaleRooms()
    // AI-only room counts as empty → cleaned once past retention
    ;(room as any).emptiedAt = Date.now() - 11 * 60 * 1000
    cleanupStaleRooms()
    expect(getRoom(room.code)).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd packages/server && npx jest room-lifecycle --forceExit`
Expected: FAIL（`leaveRoom` 立即删房、无 `emptiedAt`）。

- [ ] **Step 3: 改 `room.ts`**

```ts
// leaveRoom：不再立即删空房，记录 emptiedAt
export function leaveRoom(code: string, playerId: string): Room | null {
  const room = rooms.get(code)
  if (!room) return null
  room.players = room.players.filter(p => p.id !== playerId)
  removePlayer(playerId)
  if (!room.players.some(p => !p.isAI)) room.emptiedAt = Date.now()
  return room
}

export function cleanupStaleRooms(now = Date.now()): void {
  for (const [code, room] of rooms) {
    const empty = !room.players.some(p => !p.isAI)
    if (empty && room.emptiedAt && now - room.emptiedAt > 10 * 60 * 1000) rooms.delete(code)
  }
}
```
`Room` 增加 `emptiedAt?: number`；`createRoom` 初始化 `emptiedAt: 0`。

- [ ] **Step 4: `ws.ts` 移除 ready、加入 `start_game`、空置判定、大厅广播**

- 删除 `socket.on('ready', …)` 与 `socket.on('start_new_game', …)`。
- 新增：
```ts
socket.on('start_game', () => {
  const room = currentRoomCode ? getRoom(currentRoomCode) : undefined
  if (!room) return
  if (!room.players.some(p => p.id === me.id)) { socket.emit('error', { message: '你不在该房间' }); return }
  if (room.game) { socket.emit('error', { message: '对局已开始' }); return }
  if (room.players.length < 2) { socket.emit('error', { message: '至少需要 2 名玩家' }); return }
  startRoom(io, room)   // 抽出原 ready 分支的开局逻辑（initGame + pendingSurrender/emitGameStart）
})
```
- 抽 `function startRoom(io, room)`：把原 `ready` 里 `if (every ready)` 的整段开局逻辑搬进来。
- 大厅广播：定义 `broadcastLobby(io)`，在 建/入/离房、开局、解散时调用，向所有已鉴权 socket 发 `lobby_users_updated` / `lobby_rooms_updated`（数据取自 `listUsers()`、`getAllRooms()`）。

- [ ] **Step 5: `index.ts` 定时清理**

```ts
import { cleanupStaleRooms } from './room'
setInterval(() => cleanupStaleRooms(), 60_000).unref()
```

- [ ] **Step 6: 运行测试 + 类型检查**

Run: `cd packages/server && npx jest room-lifecycle room --forceExit && npx tsc --noEmit`
Expected: PASS / exit 0。

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/room.ts packages/server/src/types.ts packages/server/src/ws.ts packages/server/src/index.ts packages/server/src/__tests__/room-lifecycle.test.ts
git commit -m "feat(server): fixed-6 rooms, any-player start_game, 10min empty cleanup"
```

---

## Phase 3 — 全局排名与战绩写回

### Task 6: 战绩写回（局末累加账号 wins/boxerWins）

**Files:**
- Modify: `packages/server/src/ws.ts`（`finishBoxerFlow` 内写库）
- Test: `packages/server/src/__tests__/stats-persist.test.ts`

**Interfaces:**
- Consumes: `db.addStats`、`findUserById`。
- Produces: 局末对参与的真实账号累加 `wins`（最终第一名）与 `boxerWins`（拳王）。

- [ ] **Step 1: 写失败测试**

Create `packages/server/src/__tests__/stats-persist.test.ts`（纯 db 断言 + 一个导出辅助）:
```ts
import { describe, test, expect, beforeEach } from '@jest/globals'
process.env.DB_PATH = ':memory:'
import { initDb, createUser, findUserById } from '../db'
import { persistGameStats } from '../stats'

describe('persistGameStats', () => {
  beforeEach(() => initDb())
  test('adds wins to first place and boxerWins to champions', () => {
    const a = createUser('a', 'h'), b = createUser('b', 'h')
    persistGameStats([
      { id: a.id, rank1: true, boxerWins: 2 },
      { id: b.id, rank1: false, boxerWins: 0 },
    ])
    expect(findUserById(a.id)).toMatchObject({ wins: 1, boxer_wins: 2 })
    expect(findUserById(b.id)).toMatchObject({ wins: 0, boxer_wins: 0 })
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd packages/server && npx jest stats-persist --forceExit`
Expected: FAIL。

- [ ] **Step 3: 实现 `stats.ts`**

Create `packages/server/src/stats.ts`:
```ts
import { addStats, findUserById } from './db'

export interface GamePlayerStat { id: string; rank1: boolean; boxerWins: number }

export function persistGameStats(stats: GamePlayerStat[]): void {
  for (const s of stats) {
    if (!findUserById(s.id)) continue          // skip AI / deleted accounts
    addStats(s.id, s.rank1 ? 1 : 0, s.boxerWins)
  }
}
```

- [ ] **Step 4: 在 `finishBoxerFlow` 调用**

在 `finishBoxerFlow` 已算出 `sorted`（最终排名）与各玩家 `boxerWins` 后：
```ts
persistGameStats(game.players.map((p, i) => ({
  id: p.id,
  rank1: sorted[0]?.id === p.id,
  boxerWins: p.boxerWins,
})))
```
（`p.boxerWins` 为该局累计的拳王获胜次数，见现有实现。）

- [ ] **Step 5: 运行确认通过**

Run: `cd packages/server && npx jest stats-persist --forceExit`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/stats.ts packages/server/src/ws.ts packages/server/src/__tests__/stats-persist.test.ts
git commit -m "feat(server): persist per-account wins/boxerWins at game end"
```

---

### Task 7: 全局排名与大厅数据接口（REST 已完成于 Task 3，本任务补类型与前端契约测试）

**Files:**
- Test: `packages/server/src/__tests__/leaderboard.test.ts`

**Interfaces:**
- Consumes: `api.ts` `/api/leaderboard`、`/api/users`、`/api/rooms`。

- [ ] **Step 1: 写测试**

Create `packages/server/src/__tests__/leaderboard.test.ts`（复用 Task 3 的 `withServer` 模式）：
```ts
import { describe, test, expect, beforeEach } from '@jest/globals'
import { createServer } from 'http'
import express from 'express'
process.env.DB_PATH = ':memory:'
import { initDb, createUser, addStats } from '../db'
import { signToken } from '../auth'
import apiRoutes from '../api'

async function withServer(fn: (base: string) => Promise<void>) {
  const app = express(); app.use(express.json()); app.use('/api', apiRoutes)
  const srv = createServer(app); await new Promise<void>(r => srv.listen(0, r))
  const { port } = srv.address() as any
  try { await fn(`http://localhost:${port}`) } finally { await new Promise<void>(r => srv.close(() => r())) }
}

describe('leaderboard', () => {
  beforeEach(() => initDb())
  test('wins and boxerWins boards', async () => {
    await withServer(async base => {
      const a = createUser('a', 'h'); const b = createUser('b', 'h'); addStats(a.id, 2, 0); addStats(b.id, 0, 3)
      const tok = signToken(createUser('viewer', 'h'))
      const h = { authorization: `Bearer ${tok}` }
      const wins = await (await fetch(`${base}/api/leaderboard?metric=wins`, { headers: h })).json() as any[]
      expect(wins[0].username).toBe('a')
      const boxer = await (await fetch(`${base}/api/leaderboard?metric=boxerWins`, { headers: h })).json() as any[]
      expect(boxer[0].username).toBe('b')
    })
  })
})
```

- [ ] **Step 2: 运行确认通过（实现已在 Task 3/6 完成）**

Run: `cd packages/server && npx jest leaderboard --forceExit`
Expected: PASS。若失败，修 `api.ts` 的排序/字段。

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/__tests__/leaderboard.test.ts
git commit -m "test(server): leaderboard endpoints"
```

---

## Phase 4 — 客户端

### Task 8: auth store + fetch 封装 + socket 鉴权 + 路由守卫 + LoginView

**Files:**
- Create: `packages/client/src/stores/auth.ts`
- Create: `packages/client/src/api.ts`
- Modify: `packages/client/src/composables/useSocket.ts`（连接带 token）
- Modify: `packages/client/src/router/index.ts`（守卫 + 新路由）
- Create: `packages/client/src/views/LoginView.vue`
- Test: `packages/client/src/__tests__/auth-store.test.ts`

**Interfaces:**
- Produces: `useAuthStore()`（`token`、`user`、`login`、`register`、`logout`、`loadMe`）；`apiFetch(path, opts)`。

- [ ] **Step 1: 写失败测试**

Create `packages/client/src/__tests__/auth-store.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../api', () => ({
  apiFetch: vi.fn(async (path: string) => {
    if (path === '/api/auth/login') return { token: 'T', user: { id: 'u', username: 'a', role: 'user', wins: 0, boxerWins: 0, online: true } }
    return {}
  }),
  setToken: vi.fn(), getToken: vi.fn(() => null),
}))
vi.mock('../composables/useSocket', () => ({ useSocket: () => ({ socket: { value: null }, connect: vi.fn(), disconnect: vi.fn() }) }))

import { useAuthStore } from '../stores/auth'

describe('auth store', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('login stores token + user', async () => {
    const auth = useAuthStore()
    await auth.login('a', 'secret123')
    expect(auth.token).toBe('T')
    expect(auth.user?.username).toBe('a')
    expect(auth.isLoggedIn).toBe(true)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd packages/client && npx vitest run src/__tests__/auth-store.test.ts`
Expected: FAIL。

- [ ] **Step 3: 实现 `api.ts`**

Create `packages/client/src/api.ts`:
```ts
const KEY = 'auth_token'
export function getToken(): string | null { return localStorage.getItem(KEY) }
export function setToken(t: string | null) { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY) }

export async function apiFetch(path: string, opts: RequestInit = {}): Promise<any> {
  const token = getToken()
  const headers: Record<string, string> = { ...(opts.headers as any) }
  if (opts.body) headers['content-type'] = 'application/json'
  if (token) headers['authorization'] = `Bearer ${token}`
  const res = await fetch(path, { ...opts, headers })
  if (res.status === 401) { setToken(null); window.location.href = '/login'; throw new Error('unauthorized') }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}
```

- [ ] **Step 4: 实现 `stores/auth.ts`**

Create `packages/client/src/stores/auth.ts`:
```ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { apiFetch, setToken, getToken } from '../api'
import { useSocket } from '../composables/useSocket'

export interface AuthUser { id: string; username: string; role: 'admin' | 'user'; wins: number; boxerWins: number; online: boolean }

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(getToken())
  const user = ref<AuthUser | null>(null)
  const isLoggedIn = computed(() => !!token.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  function apply(t: string, u: AuthUser) { token.value = t; user.value = u; setToken(t) }

  async function login(username: string, password: string) {
    const d = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
    apply(d.token, d.user)
  }
  async function register(username: string, password: string) {
    const d = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) })
    apply(d.token, d.user)
  }
  async function loadMe() {
    if (!token.value) return
    try { user.value = await apiFetch('/api/auth/me') } catch { token.value = null }
  }
  function logout() {
    token.value = null; user.value = null; setToken(null)
    useSocket().disconnect()
  }
  return { token, user, isLoggedIn, isAdmin, login, register, loadMe, logout }
})
```

- [ ] **Step 5: `useSocket.ts` 带 token 连接**

```ts
import { io, Socket } from 'socket.io-client'
import { ref } from 'vue'
import { getToken } from '../api'
const socket = ref<Socket | null>(null)
export function useSocket() {
  function connect() {
    if (!socket.value) socket.value = io('/', { transports: ['websocket', 'polling'], auth: { token: getToken() } })
    return socket.value
  }
  function disconnect() { socket.value?.disconnect(); socket.value = null }
  return { socket, connect, disconnect }
}
```

- [ ] **Step 6: 路由守卫 + LoginView**

`router/index.ts`：新增 `/login`（`LoginView`）、`/lobby`（`LobbyView`，Task 9 创建，可先占位组件）；把 `/` 重定向到 `/lobby`；移除 `HomeView` 路由。守卫：
```ts
router.beforeEach((to) => {
  const authed = !!getToken()
  if (!authed && to.path !== '/login') return '/login'
  if (authed && to.path === '/login') return '/lobby'
})
```
Create `packages/client/src/views/LoginView.vue`（登录/注册切换，调用 `auth.login/register`，成功后 `router.push('/lobby')`，失败显示错误）：
```vue
<template>
  <div class="login">
    <h1>烟三文四</h1>
    <p class="sub">{{ mode === 'login' ? '登录' : '注册' }}</p>
    <input v-model="username" placeholder="用户名" />
    <input v-model="password" type="password" placeholder="密码（≥6位）" />
    <button @click="submit">{{ mode === 'login' ? '登录' : '注册' }}</button>
    <p class="err" v-if="error">{{ error }}</p>
    <a @click="toggle">{{ mode === 'login' ? '没有账号？去注册' : '已有账号？去登录' }}</a>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
const auth = useAuthStore(); const router = useRouter()
const mode = ref<'login'|'register'>('login')
const username = ref(''); const password = ref(''); const error = ref('')
function toggle() { mode.value = mode.value === 'login' ? 'register' : 'login'; error.value = '' }
async function submit() {
  error.value = ''
  try {
    if (mode.value === 'login') await auth.login(username.value, password.value)
    else await auth.register(username.value, password.value)
    router.push('/lobby')
  } catch (e: any) { error.value = e.message }
}
</script>
```

- [ ] **Step 7: 运行测试 + 类型检查**

Run: `cd packages/client && npx vitest run src/__tests__/auth-store.test.ts && npx vue-tsc --noEmit`
Expected: PASS / exit 0。

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/api.ts packages/client/src/stores/auth.ts packages/client/src/composables/useSocket.ts packages/client/src/router/index.ts packages/client/src/views/LoginView.vue packages/client/src/__tests__/auth-store.test.ts
git commit -m "feat(client): auth store, login view, route guard, token-authed socket"
```

---

### Task 9: LobbyView（三标签）+ 用户/房间列表 + 创建/加入 + 管理页 + RoomView 开局按钮

**Files:**
- Create: `packages/client/src/views/LobbyView.vue`
- Create: `packages/client/src/components/lobby/UserList.vue`
- Create: `packages/client/src/components/lobby/RoomList.vue`
- Create: `packages/client/src/components/lobby/Leaderboard.vue`
- Create: `packages/client/src/components/lobby/AdminPanel.vue`
- Modify: `packages/client/src/views/RoomView.vue`（去 ready，改「开局」）
- Modify: `packages/client/src/composables/useRoom.ts`（`startGame`、`createRoom` 去掉人数/昵称）
- Test: `packages/client/src/__tests__/lobby.test.ts`

**Interfaces:**
- Consumes: `apiFetch`、`useAuthStore`、`useSocket`；server 事件 `start_game`、`lobby_users_updated`、`lobby_rooms_updated`。
- Produces: 大厅三标签 UI。

- [ ] **Step 1: 写失败测试**

Create `packages/client/src/__tests__/lobby.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('../api', () => ({
  apiFetch: vi.fn(async (path: string) => {
    if (path === '/api/users') return [{ id: 'u', username: 'a', role: 'user', wins: 2, boxerWins: 1, online: true }]
    if (path === '/api/rooms') return [{ code: 'ABC123', hostId: 'u', playerCount: 1, maxPlayers: 6, inGame: false }]
    return []
  }),
  getToken: vi.fn(() => 'T'), setToken: vi.fn(),
}))
vi.mock('../composables/useSocket', () => ({ useSocket: () => ({ socket: { value: null }, connect: vi.fn(), disconnect: vi.fn() }) }))

import { mount } from '@vue/test-utils'
import RoomList from '../components/lobby/RoomList.vue'

describe('RoomList', () => {
  beforeEach(() => setActivePinia(createPinia()))
  it('renders rooms and disables in-game join', async () => {
    const w = mount(RoomList, { props: { rooms: [
      { code: 'A1', hostName: 'h', playerCount: 1, maxPlayers: 6, inGame: false },
      { code: 'B2', hostName: 'h', playerCount: 4, maxPlayers: 6, inGame: true },
    ] } })
    const items = w.findAll('.room-item')
    expect(items).toHaveLength(2)
    expect(items[1].find('button').attributes('disabled')).toBeDefined()
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `cd packages/client && npx vitest run src/__tests__/lobby.test.ts`
Expected: FAIL。

- [ ] **Step 3: `RoomList.vue` / `UserList.vue` / `Leaderboard.vue` / `AdminPanel.vue`**

`RoomList.vue`（房间列表；等待中可加入）:
```vue
<template>
  <div class="room-list">
    <div v-for="r in rooms" :key="r.code" class="room-item">
      <span class="code">{{ r.code }}</span>
      <span class="host">{{ r.hostName }}</span>
      <span class="count">{{ r.playerCount }}/{{ r.maxPlayers }}</span>
      <span class="state">{{ r.inGame ? '进行中' : '等待中' }}</span>
      <button :disabled="r.inGame || r.playerCount >= r.maxPlayers" @click="$emit('join', r.code)">加入</button>
    </div>
    <p v-if="!rooms.length" class="empty">暂无房间</p>
  </div>
</template>
<script setup lang="ts">
defineProps<{ rooms: { code: string; hostName: string; playerCount: number; maxPlayers: number; inGame: boolean }[] }>()
defineEmits<{ join: [code: string] }>()
</script>
```
`UserList.vue`：遍历 `users`，显示 `username / wins / boxerWins / ●在线|○离线`。
`Leaderboard.vue`：props `{ metric }`，内部 `apiFetch('/api/leaderboard?metric=...')`，渲染名次。
`AdminPanel.vue`：用户表格 + 重置/删/改角色按钮 + 房间解散；调用 `/api/admin/*`。

- [ ] **Step 4: `LobbyView.vue`（三标签）**

```vue
<template>
  <div class="lobby">
    <nav class="tabs">
      <button :class="{ active: tab==='hall' }" @click="tab='hall'">大厅</button>
      <button :class="{ active: tab==='rank' }" @click="tab='rank'">全局排名</button>
      <button v-if="auth.isAdmin" :class="{ active: tab==='admin' }" @click="tab='admin'">管理</button>
      <span class="spacer" />
      <span class="me">{{ auth.user?.username }}</span>
      <button class="logout" @click="onLogout">登出</button>
    </nav>
    <div v-if="tab==='hall'" class="hall">
      <section class="rooms">
        <div class="head"><h3>房间</h3>
          <button @click="createRoom">创建房间</button>
          <input v-model="joinCode" maxlength="6" placeholder="房号" @input="joinCode = joinCode.toUpperCase()" />
          <button @click="joinByCode">加入</button>
        </div>
        <RoomList :rooms="rooms" @join="joinByCode2" />
      </section>
      <section class="users"><h3>用户</h3><UserList :users="users" /></section>
    </div>
    <Leaderboard v-else-if="tab==='rank'" />
    <AdminPanel v-else-if="tab==='admin'" @rooms-changed="refreshRooms" />
  </div>
</template>
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { apiFetch } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSocket } from '@/composables/useSocket'
import RoomList from '@/components/lobby/RoomList.vue'
import UserList from '@/components/lobby/UserList.vue'
import Leaderboard from '@/components/lobby/Leaderboard.vue'
import AdminPanel from '@/components/lobby/AdminPanel.vue'

const auth = useAuthStore(); const router = useRouter(); const { socket, connect } = useSocket()
const tab = ref<'hall'|'rank'|'admin'>('hall')
const users = ref<any[]>([]); const rooms = ref<any[]>([]); const joinCode = ref('')

async function refreshUsers() { users.value = await apiFetch('/api/users') }
async function refreshRooms() {
  const raw = await apiFetch('/api/rooms')
  rooms.value = raw.map((r: any) => ({ ...r, hostName: '' }))
}
async function createRoom() {
  const { roomCode } = await apiFetch('/api/rooms', { method: 'POST' })
  // server 也会在 socket create_room 时发 room_created；这里直接导航
  router.push(`/room/${roomCode}`)
}
function joinByCode2(code: string) { socket.value?.emit('join_room', { roomCode: code }) }
function joinByCode() { if (joinCode.value.length === 6) joinByCode2(joinCode.value) }
function onLogout() { auth.logout(); router.push('/login') }

onMounted(async () => {
  connect()
  await auth.loadMe()
  await Promise.all([refreshUsers(), refreshRooms()])
  socket.value?.on('lobby_users_updated', (d: any) => { users.value = d.users })
  socket.value?.on('lobby_rooms_updated', (d: any) => { rooms.value = d.rooms })
  socket.value?.on('room_created', (d: any) => router.push(`/room/${d.roomCode}`))
  socket.value?.on('player_joined', () => router.push(`/room/${auth.user ? '' : ''}`))
  socket.value?.on('error', (d: any) => { console.warn(d.message) })
})
onUnmounted(() => { socket.value?.off('lobby_users_updated'); socket.value?.off('lobby_rooms_updated') })
</script>
```

- [ ] **Step 5: `useRoom.ts` 调整**

- `createRoom()` 改为 `socket.emit('create_room', {})`（由 LobbyView 直接走 REST 建房间亦可；二选一，保持单一入口：**建议全部走 socket `create_room`**）。
- 新增 `startGame()` → `socket.emit('start_game')`。
- 删除 `ready()`、`startNewGame()`、`amReady` 相关。

- [ ] **Step 6: `RoomView.vue` 改造**

- 去掉「准备」按钮与 `amReady`。
- 底部改为所有玩家可见：
```html
<button @click="startGame" :disabled="players.length < 2 || started" class="start-btn">开局</button>
<p v-if="players.length < 2" class="hint">至少 2 人才能开局</p>
```
- 房主区保留 AI 控件（`＋AI`/`补满 AI`/移除）。

- [ ] **Step 7: 类型检查 + 构建 + 测试**

Run: `cd packages/client && npx vue-tsc --noEmit && npx vitest run && npx vite build`
Expected: 全绿。

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/views/LobbyView.vue packages/client/src/views/RoomView.vue packages/client/src/components/lobby packages/client/src/composables/useRoom.ts packages/client/src/__tests__/lobby.test.ts
git commit -m "feat(client): lobby (users/rooms/leaderboard/admin) + start_game button"
```

---

### Task 10: 端到端手测脚本（本地一次性）

**Files:**
- 无（人工验证）

- [ ] **Step 1: 启动并验证**

```bash
npx pnpm dev
```
浏览器 `http://localhost:5173`：
1. 首次注册用户 `admin`（或设置 `ADMIN_USERNAME/ADMIN_PASSWORD` 后注册普通用户，用管理员账号登录）。
2. 登录 → 大厅出现用户名与房间页签。
3. 创建房间 → 进 `RoomView` → 加入另一个浏览器账号 → 点「开局」→ 正常对局。
4. 全局排名标签显示两个榜。
5. 管理标签（管理员）可删用户 / 重置 / 解散房间。
6. 全部玩家退出房间 → 房间从大厅消失；10 分钟后清理（可用 `cleanupStaleRooms` 手动/等待）。

- [ ] **Step 2: Commit（若有遗留修改）**

```bash
git add -A && git commit -m "chore: lobby/auth e2e fixes"
```

---

## Phase 5 — 既有测试与文档收尾

### Task 11: 更新旧 socket 集成测试（带 token）+ 修订原设计文档 §11

**Files:**
- Modify: `packages/server/src/__tests__/ws-integration.test.ts`
- Modify: `docs/superpowers/specs/2026-06-05-79523-design.md`

- [ ] **Step 1: 给集成测试加鉴权**

在 `ws-integration.test.ts` 里：`beforeAll` 初始化 `initDb()`；`connectClient()` 改为先注册一名唯一用户并 `io(url, { auth: { token: signToken(user) } })`：
```ts
let userSeq = 0
async function connectClient(): Promise<Socket> {
  const user = registerUser(`u${Date.now()}_${userSeq++}`, 'secret123')
  const socket = ioc(url, { transports: ['websocket'], forceNew: true, auth: { token: signToken(user) } })
  sockets.push(socket)
  await waitFor(socket, 'connect')
  return socket
}
```
- `create_room` 载荷改为 `{}`；`startTwoPlayerGame()` 里删除 `ready`，改为两名玩家就绪后由一方 `emit('start_game')`；删除所有 `ready` 调用。
- 断言相应更新（`players_updated`/`player_joined` 字段可能变化）。

- [ ] **Step 2: 运行**

Run: `cd packages/server && npx jest ws-integration --forceExit`
Expected: PASS。

- [ ] **Step 3: 修订原设计文档 §11**

`docs/superpowers/specs/2026-06-05-79523-design.md` §11「不做的事」中：
- 删除/改写 "无登录/注册（昵称即可）" → "有账号体系（见 accounts-lobby-design）"。
- "无数据库持久化（重启丢失房间）" → "账号与战绩持久化；房间仍不落库"。
- "无大厅匹配（仅房间码加入）" → "有大厅（房间列表 + 点击/房号加入）"。

- [ ] **Step 4: 全量测试 + 类型检查**

Run:
```bash
npx pnpm test && (cd packages/server && npx tsc --noEmit) && (cd packages/client && npx vue-tsc --noEmit)
```
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/__tests__/ws-integration.test.ts docs/superpowers/specs/2026-06-05-79523-design.md
git commit -m "test+docs: token-auth integration tests; update non-goals"
```

---

## Self-Review

**Spec 覆盖：**
- §5 数据模型/seed → Task 1
- §6 鉴权（REST+socket）→ Task 2/3/4
- §7 角色与管理权限 → Task 3
- §8 房间流程（固定 6 / 任意开局 / 空置清理）→ Task 5
- §9 大厅 → Task 3（REST）+ Task 9（UI）
- §10 全局排名 → Task 3/7
- §11 战绩持久化 → Task 6
- §12 客户端结构 → Task 8/9
- §13 对既有代码/测试影响 → Task 4/11
- §14 安全 → Task 2/3（哈希、鉴权、防自删）
- §15 测试策略 → 各 Task 的测试 + Task 7/11

**类型一致性：** `UserRow`/`Role`（Task 1）在三处使用一致；`publicUser`（Task 2）被 API 复用；`createPlayerForAccount`（Task 4）被 room-lifecycle 测试使用；`persistGameStats`（Task 6）签名与 `finishBoxerFlow` 调用一致。

**Placeholder 扫描：** 无 TBD/TODO；每个实现步骤含代码。UI 组件为可运行骨架，样式在实现时按现有 `.vue` 风格补（不阻塞逻辑）。

**已知实现风险（实现时注意）：**
- `api.ts` 与 `online.ts`/`ws.ts` 的循环依赖：`online.ts` 只依赖类型，`api.ts` 顶部 import 即可。
- socket 鉴权后，断线重连需前端用同一 token 重连并由服务端按 `me.id` 恢复房间座位（Task 4 的 `reconnect` 简化为按账号 id 查房）。
- 现有 `ws-integration.test.ts` 在 Task 4 之后会红，直到 Task 11 修复——这是已知的阶段性状态，Task 4 的验收只看新增 `ws-auth` 测试。
