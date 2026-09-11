import { describe, test, expect, beforeEach, afterAll } from '@jest/globals'
import { createServer } from 'http'
import type { Server as HttpServer } from 'http'
import { io as ioc } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { initDb, db } from '../db'
import { registerUser, signToken } from '../auth'
import { setupWebSocket } from '../ws'

let srv: HttpServer
let url = ''

beforeEach(async () => {
  initDb()
  db.exec('DELETE FROM users')
  srv = createServer()
  setupWebSocket(srv)
  await new Promise<void>(r => srv.listen(0, r))
  url = `http://localhost:${(srv.address() as any).port}`
})

afterAll(async () => { if (srv) await new Promise<void>(r => srv.close(() => r())) })

function waitFor(s: Socket, evt: string, t = 4000): Promise<any> {
  return new Promise((resolve, reject) => {
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
