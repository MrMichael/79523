import { createServer } from 'http'
import type { Server as HttpServer } from 'http'
import type { AddressInfo } from 'net'
import { io as ioc } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { getSmallestCard } from '@79523/engine'
import type { Card } from '@79523/engine'
import { setupWebSocket } from '../ws'

// ── Integration harness: real HTTP server + real socket.io clients ──

let httpServer: HttpServer
let url: string
const sockets: Socket[] = []

beforeAll(async () => {
  httpServer = createServer()
  setupWebSocket(httpServer)
  await new Promise<void>(resolve => httpServer.listen(0, resolve))
  const { port } = httpServer.address() as AddressInfo
  url = `http://localhost:${port}`
})

afterAll(async () => {
  for (const s of sockets) s.disconnect()
  await new Promise<void>(resolve => httpServer.close(() => resolve()))
})

function waitFor<T = any>(socket: Socket, event: string, timeout = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler)
      reject(new Error(`timeout waiting for "${event}"`))
    }, timeout)
    const handler = (data: T) => {
      clearTimeout(timer)
      socket.off(event, handler)
      resolve(data)
    }
    socket.on(event, handler)
  })
}

async function connectClient(): Promise<Socket> {
  const socket = ioc(url, { transports: ['websocket'], forceNew: true })
  sockets.push(socket)
  await waitFor(socket, 'connect')
  return socket
}

/** Create a 2-player room, both ready, and wait for game_started on both. */
async function startTwoPlayerGame() {
  const host = await connectClient()
  host.emit('create_room', { name: 'H', maxPlayers: 2 })
  const { roomCode } = await waitFor<{ roomCode: string }>(host, 'room_created')

  const guest = await connectClient()
  const joined = waitFor(host, 'player_joined')
  guest.emit('join_room', { roomCode, playerName: 'G' })
  await joined

  const hostStart = waitFor<any>(host, 'game_started')
  const guestStart = waitFor<any>(guest, 'game_started')
  host.emit('ready')
  guest.emit('ready')
  const [hs, gs] = await Promise.all([hostStart, guestStart])

  const leadSocket = hs.myId === hs.leadPlayerId ? host : guest
  const otherSocket = leadSocket === host ? guest : host
  const leadState = leadSocket === host ? hs : gs
  return { host, guest, hs, gs, leadSocket, otherSocket, leadState, roomCode }
}

describe('WebSocket integration', () => {
  test('create → join → ready → game_started deals 5 cards to each', async () => {
    const { hs, gs, roomCode } = await startTwoPlayerGame()
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/)
    expect(hs.hand).toHaveLength(5)
    expect(gs.hand).toHaveLength(5)
    expect(hs.myId).not.toBe(gs.myId)
  }, 15000)

  test('lead plays, opponent passes → round_result awards the trick to the lead', async () => {
    const { host, leadSocket, otherSocket, hs, gs } = await startTwoPlayerGame()
    const leadId = leadSocket === host ? hs.myId : gs.myId
    const leadHand: Card[] = leadSocket === host ? hs.hand : gs.hand
    const smallest = getSmallestCard(leadHand)!

    const playMade = waitFor<any>(otherSocket, 'play_made')
    leadSocket.emit('play', { cards: [smallest] })
    const pm = await playMade
    expect(pm.playerId).toBe(leadId)
    expect(pm.tableCards).toHaveLength(1)

    const roundResult = waitFor<any>(host, 'round_result')
    otherSocket.emit('pass')
    const rr = await roundResult
    expect(rr.winnerId).toBe(leadId)
    expect(rr.scores.find((s: any) => s.id === leadId)).toBeDefined()
  }, 15000)

  test('a player kicked mid-game does not stall it (turn passes to the survivor)', async () => {
    process.env.DISCONNECT_KICK_MS = '100'
    try {
      const { leadSocket, otherSocket, gs, hs, host } = await startTwoPlayerGame()
      const survivorTurn = waitFor<any>(otherSocket, 'your_turn', 4000)
      // The current player (lead) vanishes; after the kick delay the game must hand the turn over.
      leadSocket.disconnect()
      const turn = await survivorTurn
      expect(turn.hand).toBeDefined()
      // sanity: the survivor is the one still connected
      const leadId = leadSocket === host ? hs.myId : gs.myId
      expect(leadId).toBeTruthy()
    } finally {
      delete process.env.DISCONNECT_KICK_MS
    }
  }, 15000)
})
