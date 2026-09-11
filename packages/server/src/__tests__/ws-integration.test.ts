import { createServer } from 'http'
import type { Server as HttpServer } from 'http'
import type { AddressInfo } from 'net'
import { io as ioc } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { getSmallestCard, chooseSurrenderGive, chooseSurrenderPick, chooseSurrenderReturn } from '@79523/engine'
import type { Card } from '@79523/engine'
import { setupWebSocket } from '../ws'
import { initDb } from '../db'
import { registerUser, signToken } from '../auth'

// ── Integration harness: real HTTP server + real socket.io clients ──

let httpServer: HttpServer
let url: string
const sockets: Socket[] = []
let userSeq = 0

beforeAll(async () => {
  initDb()
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
  const user = registerUser(`u${Date.now() % 1_000_000}_${userSeq++}`, 'secret123')
  const socket = ioc(url, { transports: ['websocket'], forceNew: true, auth: { token: signToken(user) } })
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
  host.emit('start_game')
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

  test('host can add / fill / remove AI; non-host and in-game attempts are rejected', async () => {
    const host = await connectClient()
    host.emit('create_room', {})
    const { roomCode } = await waitFor<{ roomCode: string }>(host, 'room_created')

    const guest = await connectClient()
    const joined = waitFor(host, 'player_joined')
    guest.emit('join_room', { roomCode, playerName: 'G' })
    await joined

    // add one AI
    const afterAdd = waitFor<any>(host, 'players_updated')
    host.emit('add_ai')
    let list = (await afterAdd).players
    expect(list.filter((p: any) => p.isAI)).toHaveLength(1)
    expect(list.find((p: any) => p.isAI).name).toMatch(/^电脑/)

    // fill the rest
    const afterFill = waitFor<any>(host, 'players_updated')
    host.emit('fill_ai')
    list = (await afterFill).players
    expect(list).toHaveLength(6)
    expect(list.filter((p: any) => p.isAI)).toHaveLength(4)

    // non-host cannot add
    const guestErr = waitFor<any>(guest, 'error')
    guest.emit('add_ai')
    expect((await guestErr).message).toMatch(/host/i)

    // remove one AI
    const aiId = list.find((p: any) => p.isAI).id
    const afterRemove = waitFor<any>(host, 'players_updated')
    host.emit('remove_ai', { playerId: aiId })
    list = (await afterRemove).players
    expect(list.find((p: any) => p.id === aiId)).toBeUndefined()
    expect(list.filter((p: any) => p.isAI)).toHaveLength(3)

    // removing a human is rejected
    const humanId = list.find((p: any) => !p.isAI && !p.isHost).id
    const hostErr = waitFor<any>(host, 'error')
    host.emit('remove_ai', { playerId: humanId })
    expect((await hostErr).message).toMatch(/AI/i)
  }, 15000)

  test('AI acts on its own (host + 1 AI)', async () => {
    process.env.BOT_DELAY_MS = '20'
    try {
      const host = await connectClient()
      host.emit('create_room', {})
      const { roomCode } = await waitFor<{ roomCode: string }>(host, 'room_created')
      const added = waitFor<any>(host, 'players_updated')
      host.emit('add_ai')
      await added

      // Attach listeners BEFORE ready so we don't miss the first your_turn.
      let hostHand: Card[] = []
      const actedIds: string[] = []
      host.on('play_made', (d: any) => actedIds.push(d.playerId))
      host.on('pass_made', (d: any) => actedIds.push(d.playerId))
      host.on('draw_card', (d: any) => { if (d.hand) hostHand = d.hand })
      host.on('your_turn', (d: any) => {
        if (d.hand) hostHand = d.hand
        const smallest = getSmallestCard(hostHand)
        if (smallest) host.emit('play', { cards: [smallest] })
      })

      const started = waitFor<any>(host, 'game_started')
      host.emit('start_game')
      const gs = await started
      hostHand = gs.hand
      const myId = gs.myId

      // The AI must take at least one action (play or pass) without further prompting.
      const aiActed = await new Promise<boolean>((resolve) => {
        const deadline = Date.now() + 6000
        const iv = setInterval(() => {
          if (actedIds.some(id => id !== myId)) { clearInterval(iv); resolve(true) }
          else if (Date.now() > deadline) { clearInterval(iv); resolve(false) }
        }, 20)
      })
      expect(aiActed).toBe(true)
    } finally {
      delete process.env.BOT_DELAY_MS
    }
  }, 15000)

  test('host + 3 AI: full game auto-resolves (boxer + surrender)', async () => {
    process.env.BOT_DELAY_MS = '5'
    process.env.FLOW_DELAY_MS = '5'
    try {
      const host = await connectClient()
      host.emit('create_room', {})
      const { roomCode } = await waitFor<{ roomCode: string }>(host, 'room_created')
      const full = new Promise<void>(resolve => {
        const check = (d: any) => { if (d.players.length >= 4) { host.off('players_updated', check); resolve() } }
        host.on('players_updated', check)
      })
      host.emit('add_ai'); host.emit('add_ai'); host.emit('add_ai')
      await full

      // Drive the lone human so the table keeps moving (lead smallest / otherwise pass).
      let hostHand: Card[] = []
      let tableEmpty = true
      host.on('game_started', (d: any) => { if (d.hand) hostHand = d.hand })
      host.on('draw_card', (d: any) => { if (d.hand) hostHand = d.hand })
      host.on('play_made', () => { tableEmpty = false })
      host.on('round_result', () => { tableEmpty = true })
      host.on('boxer_start', () => host.emit('boxer_move', { move: 'rock' }))
      host.on('surrender_start', (d: any) => {
        if (d.yourRole === 'loser') {
          host.emit('surrender_give', { card: chooseSurrenderGive(d.hand) })
        } else if (d.yourRole === 'winner') {
          if (d.phase === 'winners_pick' && d.surrenderedCards?.length) {
            host.emit('surrender_pick', { card: chooseSurrenderPick(d.surrenderedCards.map((s: any) => s.card)) })
          } else if (d.phase === 'winners_return') {
            host.emit('surrender_return', { card: chooseSurrenderReturn(d.hand) })
          }
        }
      })
      host.on('your_turn', (d: any) => {
        if (d.hand) hostHand = d.hand
        const smallest = getSmallestCard(hostHand)
        if (tableEmpty && smallest) host.emit('play', { cards: [smallest] })
        else host.emit('pass')
      })

      const started = waitFor<any>(host, 'game_started')
      host.emit('start_game')
      await started

      const gameOver = await waitFor<any>(host, 'game_over', 30000)
      expect(gameOver.scores).toHaveLength(4)

      // Boxer + ranking tiebreaks must resolve without any human input.
      await waitFor<any>(host, 'next_game_lead', 20000)

      // Next game: surrender (交粮) must auto-complete and play must resume.
      const resumed = Promise.race([
        waitFor<any>(host, 'surrender_swap', 10000).catch(() => null),
        waitFor<any>(host, 'play_made', 10000).catch(() => null),
        waitFor<any>(host, 'your_turn', 10000).catch(() => null),
      ])
      host.emit('start_game')
      expect(await resumed).toBeTruthy()
    } finally {
      delete process.env.BOT_DELAY_MS
      delete process.env.FLOW_DELAY_MS
    }
  }, 60000)

  test('boxer auto-resolves even if a human never submits a move', async () => {
    process.env.BOT_DELAY_MS = '5'
    process.env.FLOW_DELAY_MS = '5'
    process.env.BOXER_TIMEOUT_MS = '60'
    try {
      const host = await connectClient()
      host.emit('create_room', {})
      await waitFor(host, 'room_created')
      const full = new Promise<void>(resolve => {
        const check = (d: any) => { if (d.players.length >= 4) { host.off('players_updated', check); resolve() } }
        host.on('players_updated', check)
      })
      host.emit('add_ai'); host.emit('add_ai'); host.emit('add_ai')
      await full

      // Drive turns, but NEVER respond to boxer_start.
      let hostHand: Card[] = []
      let tableEmpty = true
      host.on('game_started', (d: any) => { if (d.hand) hostHand = d.hand })
      host.on('draw_card', (d: any) => { if (d.hand) hostHand = d.hand })
      host.on('play_made', () => { tableEmpty = false })
      host.on('round_result', () => { tableEmpty = true })
      host.on('your_turn', (d: any) => {
        if (d.hand) hostHand = d.hand
        const s = getSmallestCard(hostHand)
        if (tableEmpty && s) host.emit('play', { cards: [s] })
        else host.emit('pass')
      })

      const started = waitFor(host, 'game_started')
      host.emit('start_game')
      await started
      await waitFor(host, 'game_over', 30000)
      // Boxer must resolve via timeout so the flow reaches the next game.
      await waitFor(host, 'next_game_lead', 20000)
    } finally {
      delete process.env.BOT_DELAY_MS
      delete process.env.FLOW_DELAY_MS
      delete process.env.BOXER_TIMEOUT_MS
    }
  }, 60000)
})
