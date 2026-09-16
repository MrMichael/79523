import { jest } from '@jest/globals'
import { createServer } from 'http'
import type { Server as HttpServer } from 'http'
import type { AddressInfo } from 'net'
import { io as ioc } from 'socket.io-client'
import type { Socket } from 'socket.io-client'
import { getSmallestCard, chooseSurrenderGive, chooseSurrenderPick, chooseSurrenderReturn } from '@79523/engine'
import type { Card } from '@79523/engine'
import { setupWebSocket } from '../ws'
import { initDb, recentTotals } from '../db'
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
  ;(socket as any).__user = user
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
  // Always clear timing overrides — a test that times out never runs its own finally block,
  // which would otherwise leak env vars into later tests.
  afterEach(() => {
    for (const k of ['BOT_DELAY_MS', 'FLOW_DELAY_MS', 'BOXER_DELAY_MS', 'BOXER_TIMEOUT_MS', 'TURN_TIMEOUT_MS', 'DISCONNECT_KICK_MS']) {
      delete process.env[k]
    }
  })

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

  test('players_updated marks a player disconnected when they drop', async () => {
    const { leadSocket, otherSocket } = await startTwoPlayerGame()
    const seen = waitFor<any>(otherSocket, 'players_updated')
    leadSocket.disconnect()
    const upd = await seen
    expect(upd.players.some((p: any) => p.connected === false)).toBe(true)
  }, 15000)

  test('a game where nobody plays still auto-advances to the end', async () => {
    // Regression: the turn-timer auto-play must play the engine's smallest card or the
    // first-trick rule rejects it and the game deadlocks (both players idle ≈ both offline).
    process.env.TURN_TIMEOUT_MS = '10'
    process.env.BOT_DELAY_MS = '5'
    process.env.FLOW_DELAY_MS = '5'
    process.env.BOXER_DELAY_MS = '5'
    process.env.BOXER_TIMEOUT_MS = '20'
    try {
      const { leadSocket } = await startTwoPlayerGame()
      await waitFor(leadSocket, 'next_game_lead', 30000)
    } finally {
      delete process.env.TURN_TIMEOUT_MS
      delete process.env.BOT_DELAY_MS
      delete process.env.FLOW_DELAY_MS
      delete process.env.BOXER_DELAY_MS
      delete process.env.BOXER_TIMEOUT_MS
    }
  }, 40000)

  test('a human who keeps punching is never auto-submitted by a stale boxer timer', async () => {
    // Regression: game.boxerState is reused across rounds, so the human's per-round timeout
    // used to survive into later rounds and auto-punch before they could click.
    process.env.BOT_DELAY_MS = '5'
    process.env.FLOW_DELAY_MS = '5'
    process.env.BOXER_DELAY_MS = '20'
    process.env.BOXER_TIMEOUT_MS = '400'
    process.env.TURN_TIMEOUT_MS = '5'
    try {
      const host = await connectClient()
      host.emit('create_room', {})
      await waitFor<{ roomCode: string }>(host, 'room_created')
      const filled = waitFor(host, 'players_updated')
      host.emit('fill_ai')
      await filled

      let starts = 0
      let rejected = 0
      host.on('error', (d: any) => { if (/already submitted/i.test(d.message)) rejected++ })
      host.on('boxer_start', (d: any) => { starts++; if (!d.spectators) host.emit('boxer_move', { move: 'rock' }) })

      const started = waitFor(host, 'game_started')
      host.emit('start_game')
      await started
      await waitFor(host, 'next_game_lead', 45000)

      expect(starts).toBeGreaterThan(2) // the boxer actually ran several rounds
      expect(rejected).toBe(0) // our clicks were never pre-empted by an auto-punch
    } finally {
      delete process.env.BOT_DELAY_MS
      delete process.env.FLOW_DELAY_MS
      delete process.env.BOXER_DELAY_MS
      delete process.env.BOXER_TIMEOUT_MS
      delete process.env.TURN_TIMEOUT_MS
    }
  }, 60000)

  test('a player who leaves mid-game hands the turn to the survivor', async () => {
    // Three players (two humans + an AI): after one human leaves the table is still playable, so
    // the turn must move on instead of stalling on the empty seat. (When only one player is left
    // the game is abandoned instead — see the test below.)
    const host = await connectClient()
    host.emit('create_room', {})
    const { roomCode } = await waitFor<{ roomCode: string }>(host, 'room_created')
    const aiAdded = waitFor(host, 'players_updated')
    host.emit('add_ai')
    await aiAdded

    const guest = await connectClient()
    const joined = waitFor(host, 'player_joined')
    guest.emit('join_room', { roomCode })
    await joined

    const hostStart = waitFor<any>(host, 'game_started')
    const guestStart = waitFor<any>(guest, 'game_started')
    host.emit('start_game')
    const [hs] = await Promise.all([hostStart, guestStart])

    const leadSocket = hs.myId === hs.leadPlayerId ? host : guest
    const otherSocket = leadSocket === host ? guest : host
    const survivorTurn = waitFor<any>(otherSocket, 'your_turn', 6000)
    // Explicit leave (the tab closing / disconnect does NOT remove the seat — option B).
    leadSocket.emit('leave_room')
    const turn = await survivorTurn
    expect(turn.hand).toBeDefined()
  }, 20000)

  test('a disconnected player keeps their seat and is auto-managed (托管)', async () => {
    process.env.DISCONNECT_KICK_MS = '100'
    // Much longer than the test timeout: the turn must be auto-played by the manager, not by
    // the ordinary turn timer.
    process.env.TURN_TIMEOUT_MS = '60000'
    process.env.BOT_DELAY_MS = '5'
    try {
      const { leadSocket, otherSocket } = await startTwoPlayerGame()
      const noLeave = waitFor(otherSocket, 'player_left', 800)
      const t0 = Date.now()
      leadSocket.disconnect()
      const turn = await waitFor<any>(otherSocket, 'your_turn', 5000)
      expect(turn.hand).toBeDefined()
      expect(Date.now() - t0).toBeLessThan(3000) // auto-managed promptly, not after 60s
      // ...and the seat was NOT removed while the game is running.
      await expect(noLeave).rejects.toThrow(/timeout/)
    } finally {
      delete process.env.DISCONNECT_KICK_MS
      delete process.env.TURN_TIMEOUT_MS
      delete process.env.BOT_DELAY_MS
    }
  }, 15000)

  test('reconnecting re-binds the seat and delivers full_state (with table play owners)', async () => {
    const { host, leadSocket, otherSocket, hs, gs, roomCode } = await startTwoPlayerGame()
    // Put a card on the table first, so we can check the play ownership is restored too.
    const leadHand: Card[] = leadSocket === host ? hs.hand : gs.hand
    const leadId = leadSocket === host ? hs.myId : gs.myId
    const played = waitFor(otherSocket, 'play_made')
    leadSocket.emit('play', { cards: [getSmallestCard(leadHand)!] })
    await played

    const user = (leadSocket as any).__user
    leadSocket.disconnect()

    const revived = ioc(url, { transports: ['websocket'], forceNew: true, auth: { token: signToken(user) } })
    sockets.push(revived)
    await waitFor(revived, 'connect')
    const reconnected = waitFor(revived, 'player_reconnected')
    const fullState = waitFor<any>(revived, 'full_state')
    revived.emit('reconnect', { roomCode })
    await reconnected
    const fs = await fullState
    expect(fs.myId).toBe(user.id)
    expect(fs.roomCode).toBe(roomCode)
    expect(fs.myHand.length).toBeGreaterThan(0)
    expect(Object.keys(fs.playerNames ?? {}).length).toBeGreaterThan(0)
    // tablePlays carries who played the current table cards — it drives per-player colours.
    expect(fs.tablePlays[0].playerId).toBe(leadId)
  }, 20000)

  test('reconnecting with no game in progress routes the client back to the room', async () => {
    // Same server branch as "the game ended while we were offline" (room.game === null), but
    // deterministic — no need to wait for a random-length game to finish.
    const host = await connectClient()
    host.emit('create_room', {})
    const { roomCode } = await waitFor<{ roomCode: string }>(host, 'room_created')
    const user = (host as any).__user
    host.disconnect()

    const revived = ioc(url, { transports: ['websocket'], forceNew: true, auth: { token: signToken(user) } })
    sockets.push(revived)
    await waitFor(revived, 'connect')
    const backToRoom = waitFor<any>(revived, 'next_game_lead')
    revived.emit('reconnect', { roomCode })
    await backToRoom // without this the client would stay stuck on a finished/no game screen
  }, 15000)

  test('reconnecting during a boxer round re-sends the boxer prompt', async () => {
    process.env.BOT_DELAY_MS = '5'
    process.env.FLOW_DELAY_MS = '5'
    process.env.BOXER_DELAY_MS = '200'
    process.env.BOXER_TIMEOUT_MS = '5000' // keep the round open long enough to reconnect
    process.env.TURN_TIMEOUT_MS = '10'
    try {
      const host = await connectClient()
      host.emit('create_room', {})
      const { roomCode } = await waitFor<{ roomCode: string }>(host, 'room_created')
      // 4 players: with a small table the boxer often has zero score cards and is skipped,
      // so guarantee a real boxer round (and thus a `boxer_start`).
      for (let i = 0; i < 3; i++) {
        const added = waitFor(host, 'players_updated')
        host.emit('add_ai')
        await added
      }
      const user = (host as any).__user

      // Nobody plays manually — the turn timer auto-plays the human, so the game reliably
      // reaches the boxer without depending on the test's play being legal.
      const started = waitFor(host, 'game_started')
      host.emit('start_game')
      await started
      // Whether a boxer round happens at all is random (it needs score cards left on the
      // table); if this game skips it there is nothing to re-send.
      const which = await Promise.race([
        waitFor(host, 'boxer_start', 45000).then(() => 'boxer').catch(() => 'timeout'),
        waitFor(host, 'next_game_lead', 45000).then(() => 'done').catch(() => 'timeout'),
      ])
      if (which !== 'boxer') return

      host.disconnect()
      const revived = ioc(url, { transports: ['websocket'], forceNew: true, auth: { token: signToken(user) } })
      sockets.push(revived)
      await waitFor(revived, 'connect')
      const resent = waitFor<any>(revived, 'boxer_start')
      revived.emit('reconnect', { roomCode })
      const data = await resent
      expect(Array.isArray(data.participants)).toBe(true)
    } finally {
      delete process.env.BOT_DELAY_MS
      delete process.env.FLOW_DELAY_MS
      delete process.env.BOXER_DELAY_MS
      delete process.env.BOXER_TIMEOUT_MS
      delete process.env.TURN_TIMEOUT_MS
    }
  }, 60000)

  test('an account leaves its previous room when creating another', async () => {
    const host = await connectClient()
    const createdA = waitFor<{ roomCode: string }>(host, 'room_created')
    host.emit('create_room', {})
    const roomA = (await createdA).roomCode

    const guest = await connectClient()
    const joined = waitFor(host, 'player_joined')
    guest.emit('join_room', { roomCode: roomA })
    await joined

    // Host creates a second room -> must leave room A (the guest stays there).
    const createdB = waitFor<{ roomCode: string }>(host, 'room_created')
    // Register before emitting: player_left is broadcast while create_room is still being handled,
    // so it can arrive before room_created does.
    const leftSeen = waitFor<any>(guest, 'player_left')
    // The host left room A's broadcast group, so it must not also receive its own player_left.
    const stray = waitFor(host, 'player_left', 600)
    host.emit('create_room', {})
    const roomB = (await createdB).roomCode
    expect(roomB).not.toBe(roomA)

    const left = await leftSeen
    expect(left.playerId).toBe((host as any).__user.id)
    expect(left.players.map((p: any) => p.id)).not.toContain((host as any).__user.id)
    await expect(stray).rejects.toThrow(/timeout/)
  }, 15000)

  test('surrender auto-completes (tribute applied) when nobody acts', async () => {
    process.env.SURRENDER_TIMEOUT_MS = '200'
    process.env.TURN_TIMEOUT_MS = '10'
    process.env.BOT_DELAY_MS = '5'
    process.env.FLOW_DELAY_MS = '5'
    process.env.BOXER_DELAY_MS = '5'
    process.env.BOXER_TIMEOUT_MS = '50'
    try {
      const host = await connectClient()
      host.emit('create_room', {})
      const { roomCode } = await waitFor<{ roomCode: string }>(host, 'room_created')
      const added = waitFor(host, 'players_updated')
      host.emit('add_ai')
      await added
      expect(roomCode).toMatch(/^[A-Z0-9]{6}$/)

      let started = waitFor(host, 'game_started')
      host.emit('start_game')
      await started
      await waitFor(host, 'next_game_lead', 40000) // game 1 finishes -> next game has a surrender

      started = waitFor(host, 'game_started')
      host.emit('start_game')
      await started
      // Nobody touches the surrender UI -> the timeout performs the tribute itself.
      const swap = await waitFor<any>(host, 'surrender_swap', 15000)
      expect(swap.losers.length).toBeGreaterThan(0)
      expect(swap.losers[0].gaveUpCard).toBeDefined()
      expect(swap.losers[0].receivedCard).toBeDefined()
    } finally {
      delete process.env.SURRENDER_TIMEOUT_MS
      delete process.env.TURN_TIMEOUT_MS
      delete process.env.BOT_DELAY_MS
      delete process.env.FLOW_DELAY_MS
      delete process.env.BOXER_DELAY_MS
      delete process.env.BOXER_TIMEOUT_MS
    }
  }, 60000)

  test('a socket stops receiving the old room broadcast after leaving it', async () => {
    const host = await connectClient()
    host.emit('create_room')
    const { roomCode } = await waitFor<{ roomCode: string }>(host, 'room_created')
    const guest = await connectClient()
    const joined = waitFor(host, 'player_joined')
    guest.emit('join_room', { roomCode })
    await joined

    const left = waitFor(host, 'player_left')
    guest.emit('leave_room')
    await left

    // The host adds an AI → players_updated is broadcast to the room. The guest already left it,
    // so still receiving it means the old room's events leak into whatever they do next — that
    // leak overwrote a newly created room's player list and hid the +AI controls.
    const leaked = waitFor(guest, 'players_updated', 600)
    const hostSaw = waitFor(host, 'players_updated')
    host.emit('add_ai')
    await hostSaw
    await expect(leaked).rejects.toThrow(/timeout/)
  }, 15000)

  test('a game left with one player is abandoned instead of hanging "in progress"', async () => {
    const { host, guest } = await startTwoPlayerGame()
    // The survivor is told to go back to the room (see the emit in handlePlayerLeave — without it
    // they'd stay on a dead game screen).
    const backToRoom = waitFor<any>(host, 'next_game_lead')
    const left = waitFor(host, 'player_left')
    guest.emit('leave_room')
    await left
    await backToRoom

    // Adding an AI only works in the waiting phase, so it doubles as "is the dead game gone?".
    // While the 1-player game lingers this fails with "Game already started" and the room stays
    // stuck as 进行中 forever (that's the zombie table players kept getting trapped in).
    const err = waitFor<any>(host, 'error', 600)
    const updated = waitFor<any>(host, 'players_updated')
    host.emit('add_ai')
    const list = await updated
    expect(list.players.filter((p: any) => p.isAI)).toHaveLength(1)
    await expect(err).rejects.toThrow(/timeout/)
  }, 15000)

  test('a game that still has two players (human + AI) keeps running', async () => {
    const host = await connectClient()
    host.emit('create_room', {})
    const { roomCode } = await waitFor<{ roomCode: string }>(host, 'room_created')
    const aiAdded = waitFor(host, 'players_updated')
    host.emit('add_ai')
    await aiAdded

    const guest = await connectClient()
    const joined = waitFor(host, 'player_joined')
    guest.emit('join_room', { roomCode })
    await joined
    const hostStart = waitFor(host, 'game_started')
    const guestStart = waitFor(guest, 'game_started')
    host.emit('start_game')
    await Promise.all([hostStart, guestStart])

    const left = waitFor(host, 'player_left')
    guest.emit('leave_room')
    await left

    // A human + an AI is still a playable table — abandoning it would be wrong.
    const err = waitFor<any>(host, 'error')
    host.emit('add_ai')
    expect((await err).message).toMatch(/already started/i)
  }, 15000)

  test('join attempts leave a diagnostic trail', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {})
    try {
      const host = await connectClient()
      host.emit('create_room', {})
      const { roomCode } = await waitFor<{ roomCode: string }>(host, 'room_created')
      const guest = await connectClient()
      const joined = waitFor(host, 'player_joined')
      guest.emit('join_room', { roomCode })
      await joined

      const lines = spy.mock.calls.map(c => String(c[0])).join('\n')
      expect(lines).toContain('ROOM_CREATE')
      expect(lines).toContain('JOIN_OK')
      expect(lines).toContain(roomCode)
    } finally {
      spy.mockRestore()
    }
  }, 20000)

  test('reconnecting into a waiting room re-takes a reclaimed seat', async () => {
    // If the grace timer reclaimed the seat while we were away, returning to a room that hasn't
    // started playing must put us back in it (otherwise the player is stuck: not in the room,
    // and mid-game joins are rejected).
    process.env.DISCONNECT_KICK_MS = '100'
    try {
      const host = await connectClient()
      host.emit('create_room', {})
      const { roomCode } = await waitFor<{ roomCode: string }>(host, 'room_created')
      const guest = await connectClient()
      const joined = waitFor(host, 'player_joined')
      guest.emit('join_room', { roomCode })
      await joined
      const gUser = (guest as any).__user

      guest.disconnect()
      await new Promise(r => setTimeout(r, 400)) // grace reclaims the (waiting-room) seat

      const revived = ioc(url, { transports: ['websocket'], forceNew: true, auth: { token: signToken(gUser) } })
      sockets.push(revived)
      await waitFor(revived, 'connect')
      const rejoined = waitFor<any>(host, 'player_joined')
      const backToRoom = waitFor(revived, 'next_game_lead')
      revived.emit('reconnect', { roomCode })
      await backToRoom
      expect((await rejoined).players.map((p: any) => p.id)).toContain(gUser.id)
    } finally {
      delete process.env.DISCONNECT_KICK_MS
    }
  }, 15000)

  test('a stale socket closing does not mark a player offline', async () => {
    // A page reload / mobile resume leaves the OLD socket closing *after* the new one has
    // reconnected; that used to flip the room seat to connected=false while they were playing.
    const { host, guest, roomCode } = await startTwoPlayerGame()
    const hostUser = (host as any).__user

    const revived = ioc(url, { transports: ['websocket'], forceNew: true, auth: { token: signToken(hostUser) } })
    sockets.push(revived)
    await waitFor(revived, 'connect')
    const reconnected = waitFor(revived, 'player_reconnected')
    revived.emit('reconnect', { roomCode })
    await reconnected

    let markedOffline = false
    guest.on('players_updated', (d: any) => {
      if (d.players.find((p: any) => p.id === hostUser.id)?.connected === false) markedOffline = true
    })
    // The old socket finally goes away — the player is still online through `revived`.
    host.disconnect()
    await new Promise(r => setTimeout(r, 500))
    expect(markedOffline).toBe(false)
  }, 15000)

  test('a game is abandoned once every human has dropped', async () => {
    // Option B keeps seats mid-game, but not when nobody is left to play with — otherwise the
    // game auto-plays (30s/turn) and the room lingers as "in progress" long after everyone left.
    process.env.DISCONNECT_KICK_MS = '100'
    process.env.TURN_TIMEOUT_MS = '30000'
    try {
      const { host, guest, roomCode } = await startTwoPlayerGame()
      host.disconnect()
      guest.disconnect()
      await new Promise(r => setTimeout(r, 800))

      const late = await connectClient()
      const err = waitFor<any>(late, 'error')
      late.emit('join_room', { roomCode })
      expect(await err).toMatchObject({ message: '房间不存在', notInRoom: true })
    } finally {
      delete process.env.DISCONNECT_KICK_MS
      delete process.env.TURN_TIMEOUT_MS
    }
  }, 15000)

  test('a room is dissolved once its last human leaves', async () => {
    const host = await connectClient()
    const createdA = waitFor<{ roomCode: string }>(host, 'room_created')
    host.emit('create_room', {})
    const roomA = (await createdA).roomCode

    // Creating another room leaves room A, which had no other humans -> dissolved.
    const createdB = waitFor<{ roomCode: string }>(host, 'room_created')
    host.emit('create_room', {})
    await createdB

    const late = await connectClient()
    const err = waitFor<any>(late, 'error')
    late.emit('join_room', { roomCode: roomA })
    expect(await err).toMatchObject({ message: '房间不存在', notInRoom: true })
  }, 15000)

  test('joining a room that is already in progress seats you for the next game', async () => {
    // Mid-game joins used to be refused outright, which is what left a late friend unable to get
    // in at all. Now the seat lands in the room and plays from the next game.
    const { host, roomCode } = await startTwoPlayerGame()
    const late = await connectClient()
    const noStart = waitFor(late, 'game_started', 600)
    const joined = waitFor<any>(host, 'player_joined')
    late.emit('join_room', { roomCode })
    const list = await joined
    expect(list.players).toHaveLength(3)
    // ...but not into the game that is already dealt.
    await expect(noStart).rejects.toThrow(/timeout/)
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
    process.env.BOXER_DELAY_MS = '5'
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
      delete process.env.BOXER_DELAY_MS
    }
  }, 60000)

  test('boxer auto-resolves even if a human never submits a move', async () => {
    process.env.BOT_DELAY_MS = '5'
    process.env.FLOW_DELAY_MS = '5'
    process.env.BOXER_TIMEOUT_MS = '60'
    process.env.BOXER_DELAY_MS = '5'
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
      delete process.env.BOXER_DELAY_MS
    }
  }, 60000)

  test('a completed game persists the account stats', async () => {
    process.env.BOT_DELAY_MS = '5'
    process.env.FLOW_DELAY_MS = '5'
    process.env.BOXER_DELAY_MS = '5'
    process.env.BOXER_TIMEOUT_MS = '60'
    try {
      const user = registerUser(`persist${Date.now() % 100000}`, 'secret123')
      const host = ioc(url, { transports: ['websocket'], forceNew: true, auth: { token: signToken(user) } })
      sockets.push(host)
      await waitFor(host, 'connect')
      host.emit('create_room', {})
      await waitFor(host, 'room_created')
      const added = waitFor<any>(host, 'players_updated')
      host.emit('add_ai')
      await added

      let hostHand: Card[] = []
      let tableEmpty = true
      host.on('game_started', (d: any) => { if (d.hand) hostHand = d.hand })
      host.on('draw_card', (d: any) => { if (d.hand) hostHand = d.hand })
      host.on('play_made', () => { tableEmpty = false })
      host.on('round_result', () => { tableEmpty = true })
      host.on('boxer_start', () => host.emit('boxer_move', { move: 'rock' }))
      host.on('surrender_start', (d: any) => {
        if (d.yourRole === 'loser') host.emit('surrender_give', { card: chooseSurrenderGive(d.hand) })
        else if (d.yourRole === 'winner') {
          if (d.phase === 'winners_pick' && d.surrenderedCards?.length) host.emit('surrender_pick', { card: chooseSurrenderPick(d.surrenderedCards.map((s: any) => s.card)) })
          else if (d.phase === 'winners_return') host.emit('surrender_return', { card: chooseSurrenderReturn(d.hand) })
        }
      })
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
      await waitFor(host, 'next_game_lead', 20000)

      // The game is always logged for the account (play time + that game's wins/boxer wins),
      // regardless of whether the host happened to win — so this is deterministic.
      expect(recentTotals(Date.now() - 60_000).get(user.id)).toBeDefined()
    } finally {
      delete process.env.BOT_DELAY_MS
      delete process.env.FLOW_DELAY_MS
      delete process.env.BOXER_DELAY_MS
      delete process.env.BOXER_TIMEOUT_MS
    }
  }, 60000)
})

describe('Quick chat (常用语)', () => {
  test('broadcasts a message to everyone in the room', async () => {
    const { host, guest } = await startTwoPlayerGame()
    const seen = waitFor<any>(guest, 'chat_message')
    host.emit('chat', { text: '爽雕啷🌊' })
    const msg = await seen
    expect(msg.text).toBe('爽雕啷🌊')
    expect(msg.name).toBeTruthy()
    expect(typeof msg.at).toBe('number')
  })

  test('normalizes whitespace and drops an empty message', async () => {
    const { host, guest } = await startTwoPlayerGame()
    const seen = waitFor<any>(guest, 'chat_message')
    host.emit('chat', { text: '  好啵\n ' })
    expect((await seen).text).toBe('好啵')
    // Whitespace-only sends nothing at all (and is not an error either).
    const none = waitFor(guest, 'chat_message', 300)
    host.emit('chat', { text: '   ' })
    await expect(none).rejects.toThrow(/timeout/)
  })

  test('rejects a message longer than 30 characters', async () => {
    const { host, guest } = await startTwoPlayerGame()
    const err = waitFor<any>(host, 'error')
    host.emit('chat', { text: '好'.repeat(31) })
    expect((await err).message).toContain('30')
    const none = waitFor(guest, 'chat_message', 300)
    await expect(none).rejects.toThrow(/timeout/)
  })

  test('rate-limits rapid messages from the same player', async () => {
    const { host, guest } = await startTwoPlayerGame()
    const first = waitFor<any>(guest, 'chat_message')
    host.emit('chat', { text: '拜拜' })
    await first
    const err = waitFor<any>(host, 'error')
    host.emit('chat', { text: '拜拜' })
    expect((await err).message).toBeTruthy()
    const none = waitFor(guest, 'chat_message', 300)
    await expect(none).rejects.toThrow(/timeout/)
  }, 10000)
})

// ── 3/4 人整桌流程：加房 → 开局 → 连打两局 → 局内退房 ──
// 线上真实故障就是"多人局有人怎么都进不去 / 打不起来"，所以用真实 socket 把整条链路跑通。
describe('3/4 人整桌流程', () => {
  // 让服务端自己出牌（回合计时器极短），测试里不必写牌策略；交粮/拳王也交给超时自动完成。
  function useFastTimers() {
    process.env.TURN_TIMEOUT_MS = '10'
    process.env.BOT_DELAY_MS = '5'
    process.env.FLOW_DELAY_MS = '5'
    process.env.BOXER_DELAY_MS = '5'
    process.env.BOXER_TIMEOUT_MS = '20'
    process.env.SURRENDER_TIMEOUT_MS = '300'
  }

  afterEach(() => {
    for (const k of ['TURN_TIMEOUT_MS', 'BOT_DELAY_MS', 'FLOW_DELAY_MS', 'BOXER_DELAY_MS', 'BOXER_TIMEOUT_MS', 'SURRENDER_TIMEOUT_MS']) {
      delete process.env[k]
    }
  })

  /** n 人坐进同一桌：房主建房，其余按房号加入。 */
  async function seatTable(n: number) {
    const host = await connectClient()
    host.emit('create_room', {})
    const { roomCode } = await waitFor<{ roomCode: string }>(host, 'room_created')
    const guests: Socket[] = []
    for (let i = 1; i < n; i++) {
      const guest = await connectClient()
      const joined = waitFor(host, 'player_joined')
      guest.emit('join_room', { roomCode })
      await joined
      guests.push(guest)
    }
    return { host, guests, all: [host, ...guests], roomCode }
  }

  /** 开一局：确认 n 个人都进了牌桌（各自拿到手牌），然后等这局打完回到房间。 */
  async function playFullGame(host: Socket, all: Socket[], n: number) {
    const starts = all.map(s => waitFor<any>(s, 'game_started', 20000))
    host.emit('start_game')
    const started = await Promise.all(starts)
    for (const st of started) {
      expect(st.players).toHaveLength(n)   // 牌桌上确实是 n 个人
      expect(st.hand.length).toBeGreaterThan(0) // 每个人都真的被发了牌（不是"人在房间却没进局"）
    }
    await Promise.all(all.map(s => waitFor(s, 'next_game_lead', 180000)))
  }

  for (const n of [3, 4]) {
    test(`${n} 人：加入 → 连打两局 → 第三局中途退房`, async () => {
      useFastTimers()
      const { host, guests, all } = await seatTable(n)
      expect(all).toHaveLength(n)

      await playFullGame(host, all, n)
      await playFullGame(host, all, n)

      // 第三局：开局后一名玩家中途退出房间
      const starts = all.map(s => waitFor<any>(s, 'game_started', 20000))
      host.emit('start_game')
      await Promise.all(starts)

      const leaver = guests[0]
      const leaverId = (leaver as any).__user.id
      const survivors = [host, ...guests.slice(1)]
      const left = waitFor<any>(host, 'player_left', 10000)
      leaver.emit('leave_room')
      const after = await left
      expect(after.players).toHaveLength(n - 1)
      expect(after.players.map((p: any) => p.id)).not.toContain(leaverId)

      // 少了一个人，这局仍然要能打完（不能卡死）
      await Promise.all(survivors.map(s => waitFor(s, 'next_game_lead', 180000)))
    }, 600000)
  }

  test('中途进房的人不打本局，但下一局自动参战', async () => {
    useFastTimers()
    const { host, guests, all, roomCode } = await seatTable(3)

    // 第一局：3 人开打
    const starts = all.map(s => waitFor<any>(s, 'game_started', 20000))
    host.emit('start_game')
    await Promise.all(starts)

    // 第四个人在对局中加入
    const late = await connectClient()
    const noStart = waitFor(late, 'game_started', 800)
    const joined = waitFor<any>(host, 'player_joined', 10000)
    late.emit('join_room', { roomCode })
    expect((await joined).players).toHaveLength(4)
    await expect(noStart).rejects.toThrow(/timeout/) // 不会被丢进正在打的一局

    // 本局打完
    await Promise.all(all.map(s => waitFor(s, 'next_game_lead', 180000)))

    // 下一局：四个人全部参战
    const starts2 = [host, ...guests, late].map(s => waitFor<any>(s, 'game_started', 20000))
    host.emit('start_game')
    for (const st of await Promise.all(starts2)) {
      expect(st.players).toHaveLength(4)
      expect(st.hand.length).toBeGreaterThan(0)
    }
  }, 400000)
})
