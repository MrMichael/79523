import { describe, test, expect, beforeEach } from '@jest/globals'
import { createServer } from 'http'
import express from 'express'
import { initDb, db, setRole, findUserByUsername } from '../db'
import { registerUser } from '../auth'
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

describe('auth REST', () => {
  beforeEach(() => { initDb(); db.exec('DELETE FROM users') })

  test('register + login + me', async () => {
    await withServer(async base => {
      const r = await fetch(`${base}/api/auth/register`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'alice', password: 'secret123' }),
      })
      expect(r.status).toBe(200)
      const { token, user } = await r.json() as any
      expect(user).not.toHaveProperty('password_hash')
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
      setRole(findUserByUsername('admin')!.id, 'admin')
      registerUser('bob', 'secret123')
      const login = async (u: string) =>
        (await (await fetch(`${base}/api/auth/login`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username: u, password: 'secret123' }),
        })).json() as any).token

      expect((await fetch(`${base}/api/admin/users`, { headers: { authorization: `Bearer ${await login('bob')}` } })).status).toBe(403)
      const list = await fetch(`${base}/api/admin/users`, { headers: { authorization: `Bearer ${await login('admin')}` } })
      expect(list.status).toBe(200)
      expect((await list.json() as any[]).length).toBe(2)
    })
  })
})
