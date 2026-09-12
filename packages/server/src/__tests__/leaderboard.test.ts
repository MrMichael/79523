import { describe, test, expect, beforeEach } from '@jest/globals'
import { createServer } from 'http'
import express from 'express'
import { initDb, db, createUser, addStats, addGameLog } from '../db'
import { signToken } from '../auth'
import apiRoutes from '../api'

async function withServer(fn: (base: string) => Promise<void>) {
  const app = express()
  app.use(express.json())
  app.use('/api', apiRoutes)
  const srv = createServer(app)
  await new Promise<void>(r => srv.listen(0, r))
  const { port } = srv.address() as any
  try { await fn(`http://localhost:${port}`) } finally { await new Promise<void>(r => srv.close(() => r())) }
}

describe('leaderboard', () => {
  beforeEach(() => { initDb(); db.exec('DELETE FROM users'); db.exec('DELETE FROM play_log') })

  test('wins and boxerWins boards', async () => {
    await withServer(async base => {
      const a = createUser('a', 'h')
      const b = createUser('b', 'h')
      addStats(a.id, 2, 0)
      addStats(b.id, 0, 3)
      const viewer = createUser('viewer', 'h')
      const h = { authorization: `Bearer ${signToken(viewer)}` }

      const wins = await (await fetch(`${base}/api/leaderboard?metric=wins`, { headers: h })).json() as any[]
      expect(wins[0].username).toBe('a')

      const boxer = await (await fetch(`${base}/api/leaderboard?metric=boxerWins`, { headers: h })).json() as any[]
      expect(boxer[0].username).toBe('b')

      const users = await (await fetch(`${base}/api/users`, { headers: h })).json() as any[]
      expect(users).toHaveLength(3)
      expect(users[0]).not.toHaveProperty('password_hash')
    })
  })

  test('wins24h board ranks by wins earned in the last 24h', async () => {
    await withServer(async base => {
      const a = createUser('a', 'h')
      const b = createUser('b', 'h')
      addStats(a.id, 10, 0) // leads all-time, but not in the last 24h
      addGameLog(a.id, Date.now(), 60, 0, 0)
      addGameLog(b.id, Date.now(), 60, 3, 1)
      const viewer = createUser('viewer', 'h')
      const h = { authorization: `Bearer ${signToken(viewer)}` }

      const board = await (await fetch(`${base}/api/leaderboard?metric=wins24h`, { headers: h })).json() as any[]
      expect(board[0].username).toBe('b')
      expect(board.find(u => u.username === 'b')).toMatchObject({ wins24h: 3, boxerWins24h: 1, playSeconds24h: 60 })
      expect(board.find(u => u.username === 'a')!.wins24h).toBe(0)
    })
  })

  test('leaderboard requires auth', async () => {
    await withServer(async base => {
      expect((await fetch(`${base}/api/leaderboard`)).status).toBe(401)
    })
  })

  test('GET /rooms/:code returns room state', async () => {
    await withServer(async base => {
      const viewer = createUser('viewer', 'h')
      const h = { authorization: `Bearer ${signToken(viewer)}` }
      expect((await fetch(`${base}/api/rooms/NOPE00`, { headers: h })).status).toBe(404)
    })
  })
})
