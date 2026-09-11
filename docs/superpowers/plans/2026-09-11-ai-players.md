# AI 玩家（房主添加）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让房主在等待阶段添加服务端 AI 玩家，AI 在出牌、拳王、交粮全流程自动行动。

**Architecture:** AI 就是 `room.players` 里的普通 `Player`（`isAI:true`，无 socket，恒 ready），因此切牌/计分/统计/交粮全部复用现有逻辑。AI 决策是 `engine` 层的纯函数；由 server 的 `promptTurn()` 统一驱动，AI 与真人都经过新抽出的 `applyPlay`/`applyPass`。

**Tech Stack:** TypeScript, Node/Express/Socket.IO（server）, Vitest（engine 单测）, Jest + socket.io-client（server 集成）, Vue 3 + Pinia（client）。

**Spec:** `docs/superpowers/specs/2026-09-11-ai-players-design.md`

## Global Constraints

- 包管理器：`npx pnpm`；测试：`npx pnpm test`（engine+server+client）、`npx pnpm test:engine`、`npx pnpm test:server`、`npx pnpm test:client`。
- server 测试运行：`cd packages/server && npx jest --forceExit`；类型检查 `npx tsc --noEmit`。
- client 类型检查：`cd packages/client && npx vue-tsc --noEmit`。
- 环境变量 `BOT_DELAY_MS` 覆盖 AI 行动延迟，默认 `700`（测试用小值）。
- AI 命名 `电脑N`；`isAI` 为可选布尔；不得改动出牌规则、计分、交粮规则本身。
- engine 是纯函数层，零 socket 依赖。

---

### Task 1: engine 纯策略 `ai.ts`

**Files:**
- Create: `packages/engine/src/ai.ts`
- Test: `packages/engine/src/__tests__/ai.test.ts`
- Modify: `packages/engine/src/index.ts`

**Interfaces:**
- Consumes: `compareCards`/`getSmallestCard` (`./compare`), `identify`/`beats` (`./judge`), `BoxerMove`/`Card`/`Play` (`./types`).
- Produces:
  - `export interface AiView { hand: Card[]; currentBestPlay: Play | null }`
  - `export function choosePlay(view: AiView): Card[] | null`
  - `export function chooseBoxerMove(rand?: () => number): BoxerMove`
  - `export function chooseSurrenderGive(hand: Card[]): Card`
  - `export function chooseSurrenderPick(cards: Card[]): Card`
  - `export function chooseSurrenderReturn(hand: Card[]): Card`

- [ ] **Step 1: Write the failing test**

Create `packages/engine/src/__tests__/ai.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { choosePlay, chooseBoxerMove, chooseSurrenderGive, chooseSurrenderPick, chooseSurrenderReturn } from '../ai'
import { Suit, Rank, HandType, BoxerMove } from '../types'
import type { Card, Play } from '../types'

const c = (suit: Suit, rank: Rank): Card => ({ suit, rank })
const single = (rank: Rank): Play => ({ type: HandType.Single, cards: [c(Suit.Spade, rank)], primaryRank: rank })

describe('choosePlay', () => {
  it('returns null on empty hand', () => {
    expect(choosePlay({ hand: [], currentBestPlay: null })).toBeNull()
  })

  it('leading: plays the whole hand when it is a valid combo (go out)', () => {
    const hand = [c(Suit.Spade, Rank.Five), c(Suit.Heart, Rank.Five)]
    expect(choosePlay({ hand, currentBestPlay: null })).toEqual(hand)
  })

  it('leading: otherwise leads the smallest single', () => {
    const hand = [c(Suit.Spade, Rank.Seven), c(Suit.Heart, Rank.Four)]
    expect(choosePlay({ hand, currentBestPlay: null })).toEqual([c(Suit.Heart, Rank.Four)])
  })

  it('responding: plays the weakest card that beats the current best', () => {
    const hand = [c(Suit.Spade, Rank.Eight), c(Suit.Heart, Rank.Six), c(Suit.Club, Rank.Four)]
    expect(choosePlay({ hand, currentBestPlay: single(Rank.Four) })).toEqual([c(Suit.Heart, Rank.Six)])
  })

  it('responding: passes when nothing beats the current best', () => {
    const hand = [c(Suit.Spade, Rank.Four)]
    expect(choosePlay({ hand, currentBestPlay: single(Rank.Seven) })).toBeNull()
  })

  it('responding: prefers the matching combo type (pair over a pair)', () => {
    const best: Play = { type: HandType.Pair, cards: [c(Suit.Spade, Rank.Four), c(Suit.Heart, Rank.Four)], primaryRank: Rank.Four }
    const hand = [c(Suit.Spade, Rank.Six), c(Suit.Heart, Rank.Six), c(Suit.Club, Rank.Nine)]
    expect(choosePlay({ hand, currentBestPlay: best })).toEqual([c(Suit.Spade, Rank.Six), c(Suit.Heart, Rank.Six)])
  })
})

describe('chooseBoxerMove', () => {
  it('maps rand() to a valid move', () => {
    expect(chooseBoxerMove(() => 0)).toBe(BoxerMove.Rock)
    expect(chooseBoxerMove(() => 0.5)).toBe(BoxerMove.Paper)
    expect(chooseBoxerMove(() => 0.99)).toBe(BoxerMove.Scissors)
  })
})

describe('surrender choices', () => {
  it('give: returns the largest single card', () => {
    const hand = [c(Suit.Spade, Rank.Four), c(Suit.Heart, Rank.Seven), c(Suit.Club, Rank.King)]
    expect(chooseSurrenderGive(hand)).toEqual(c(Suit.Heart, Rank.Seven))
  })
  it('pick: returns the largest card', () => {
    const cards = [c(Suit.Spade, Rank.Four), c(Suit.Club, Rank.King)]
    expect(chooseSurrenderPick(cards)).toEqual(c(Suit.Club, Rank.King))
  })
  it('return: returns the smallest card', () => {
    const hand = [c(Suit.Spade, Rank.Seven), c(Suit.Club, Rank.Four)]
    expect(chooseSurrenderReturn(hand)).toEqual(c(Suit.Club, Rank.Four))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/engine && npx vitest run src/__tests__/ai.test.ts`
Expected: FAIL — cannot resolve `../ai`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/engine/src/ai.ts`:

```ts
import { compareCards, getSmallestCard } from './compare'
import { identify, beats } from './judge'
import { BoxerMove } from './types'
import type { Card, Play } from './types'

export interface AiView {
  hand: Card[]
  currentBestPlay: Play | null
}

function groupByRank(hand: Card[]): Card[][] {
  const byRank = new Map<number, Card[]>()
  for (const card of hand) {
    const arr = byRank.get(card.rank) || []
    arr.push(card)
    byRank.set(card.rank, arr)
  }
  return [...byRank.values()]
}

/** Root candidates: two pairs + kicker, or triple + pair. */
function rootCombos(hand: Card[]): Card[][] {
  const groups = groupByRank(hand)
  const pairs = groups.filter(g => g.length >= 2)
  const combos: Card[][] = []
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const used = [pairs[i][0], pairs[i][1], pairs[j][0], pairs[j][1]]
      const kicker = hand.find(c => !used.some(u => u.suit === c.suit && u.rank === c.rank))
      if (kicker) combos.push([...used, kicker])
    }
  }
  const triple = groups.find(g => g.length >= 3)
  if (triple) {
    const otherPair = pairs.find(g => g[0].rank !== triple[0].rank)
    if (otherPair) combos.push([triple[0], triple[1], triple[2], otherPair[0], otherPair[1]])
  }
  return combos
}

/** All candidate combos worth trying when responding. */
function candidateCombos(hand: Card[]): Card[][] {
  const groups = groupByRank(hand)
  const singles = groups.map(g => [g[0]])
  const pairs = groups.filter(g => g.length >= 2).map(g => g.slice(0, 2))
  const triples = groups.filter(g => g.length >= 3).map(g => g.slice(0, 3))
  const bikes = pairs.flatMap(pair => {
    const single = hand.find(c => c.rank !== pair[0].rank)
    return single ? [[pair[0], pair[1], single]] : []
  })
  return [...singles, ...pairs, ...triples, ...bikes, ...rootCombos(hand)]
}

function highest(cards: Card[]): Card {
  return [...cards].sort((a, b) => compareCards(b, a))[0]
}

export function choosePlay(view: AiView): Card[] | null {
  const { hand, currentBestPlay } = view
  if (hand.length === 0) return null

  if (!currentBestPlay) {
    const all = identify(hand)
    if (all) return [...hand] // go out in one play
    return [getSmallestCard(hand)!]
  }

  const beating = candidateCombos(hand)
    .map(cards => ({ cards, play: identify(cards) }))
    .filter((x): x is { cards: Card[]; play: Play } => x.play !== null && beats(x.play, currentBestPlay))
    .sort((a, b) => {
      if (a.play.primaryRank !== b.play.primaryRank) return a.play.primaryRank - b.play.primaryRank
      return compareCards(highest(a.cards), highest(b.cards))
    })
  return beating.length > 0 ? beating[0].cards : null
}

export function chooseBoxerMove(rand: () => number = Math.random): BoxerMove {
  const moves = [BoxerMove.Rock, BoxerMove.Paper, BoxerMove.Scissors]
  return moves[Math.floor(rand() * moves.length)]
}

export function chooseSurrenderGive(hand: Card[]): Card {
  return hand.reduce((max, card) => (compareCards(card, max) > 0 ? card : max))
}

export function chooseSurrenderPick(cards: Card[]): Card {
  return cards.reduce((max, card) => (compareCards(card, max) > 0 ? card : max))
}

export function chooseSurrenderReturn(hand: Card[]): Card {
  return getSmallestCard(hand)!
}
```

Modify `packages/engine/src/index.ts` — append:

```ts
export * from './ai'
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/engine && npx vitest run`
Expected: PASS (existing 75 + new ai tests).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/ai.ts packages/engine/src/__tests__/ai.test.ts packages/engine/src/index.ts
git commit -m "feat(engine): AI policy (choosePlay/boxer/surrender)"
```

---

### Task 2: AI 玩家模型与房主事件

**Files:**
- Modify: `packages/server/src/types.ts`
- Modify: `packages/server/src/player.ts`
- Modify: `packages/server/src/ws.ts`
- Test: `packages/server/src/__tests__/ws-integration.test.ts`

**Interfaces:**
- Consumes: `createAIPlayer` from Task 2, `serializePlayers` (existing, extended).
- Produces: `Player.isAI?: boolean`; `createAIPlayer(roomCode: string): Player`; client events `add_ai`/`fill_ai`/`remove_ai`.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/__tests__/ws-integration.test.ts` (inside the existing `describe('WebSocket integration', …)`):

```ts
  test('host can add / fill / remove AI; non-host and in-game attempts are rejected', async () => {
    const host = await connectClient()
    host.emit('create_room', { name: 'H', maxPlayers: 4 })
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
    expect(list).toHaveLength(4)
    expect(list.filter((p: any) => p.isAI)).toHaveLength(3)

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
    expect(list.filter((p: any) => p.isAI)).toHaveLength(2)

    // removing a human is rejected
    const hostErr = waitFor<any>(host, 'error')
    host.emit('remove_ai', { playerId: list.find((p: any) => !p.isAI && p.name === 'G').id })
    expect((await hostErr).message).toMatch(/AI/i)
  }, 15000)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx jest ws-integration -t "add / fill / remove AI"`
Expected: FAIL — no `players_updated` from `add_ai` (event ignored / timeout).

- [ ] **Step 3: Implement**

`packages/server/src/types.ts` — add to `Player`:

```ts
  isAI?: boolean
```

Add to `ClientEvents`:

```ts
  add_ai: () => void
  fill_ai: () => void
  remove_ai: (data: { playerId: string }) => void
```

In `ServerEvents`, add `isAI: boolean` to the player object of `player_joined`, `player_left`, `players_updated`:

```ts
  player_joined: (data: { players: { id: string; name: string; ready: boolean; connected: boolean; isHost: boolean; wins: number; boxerWins: number; isAI: boolean }[] }) => void
  player_left: (data: { players: { id: string; name: string; ready: boolean; connected: boolean; isHost: boolean; wins: number; boxerWins: number; isAI: boolean }[] }) => void
  players_updated: (data: { players: { id: string; name: string; ready: boolean; connected: boolean; isHost: boolean; wins: number; boxerWins: number; isAI: boolean }[] }) => void
```

`packages/server/src/player.ts` — add:

```ts
let aiCounter = 0

export function createAIPlayer(_roomCode: string): Player {
  aiCounter++
  const player: Player = {
    id: `ai-${aiCounter}-${Date.now().toString(36)}`,
    name: `电脑${aiCounter}`,
    socketId: '',
    ready: true,
    connected: true,
    isHost: false,
    isAI: true,
    wins: 0,
    boxerWins: 0,
  }
  players.set(player.id, player)
  return player
}
```

`packages/server/src/ws.ts`:

1. Import: add `createAIPlayer` to the `./player` import.
2. `serializePlayers` — include `isAI`:

```ts
function serializePlayers(players: Room['players']) {
  return players.map(p => ({ id: p.id, name: p.name, ready: p.ready, connected: p.connected, isHost: p.isHost, wins: p.wins, boxerWins: p.boxerWins, isAI: !!p.isAI }))
}
```

3. `emitDrawCards` — skip AI:

```ts
      if (p && !p.isAI) io.to(p.socketId).emit('draw_card', { hand: gp.hand, deckCount: game.deck.length })
```

4. `syncPlayerSockets` — skip AI (first line inside the loop):

```ts
      for (const player of room.players) {
        if (player.isAI) continue
        let found = false
```

5. `resetRoomForNewGame` — keep AI ready:

```ts
  for (const p of room.players) if (!p.isAI) resetPlayerReady(p.id)
```

6. Add three socket handlers just before `// ── Surrender events ──`:

```ts
    // ── AI players (host only, waiting phase) ──

    function manageAIRoom(socket: any, requireRoom = true): Room | null {
      const room = currentRoomCode ? getRoom(currentRoomCode) : undefined
      if (!room) { if (requireRoom) socket.emit('error', { message: 'Room not found' }); return null }
      const host = room.players.find(p => p.id === currentPlayerId)
      if (!host?.isHost) { socket.emit('error', { message: 'Only the host can manage AI' }); return null }
      if (room.game) { socket.emit('error', { message: 'Game already started' }); return null }
      return room
    }

    socket.on('add_ai', () => {
      const room = manageAIRoom(socket)
      if (!room) return
      if (room.players.length >= room.maxPlayers) { socket.emit('error', { message: 'Room is full' }); return }
      joinRoom(room.code, createAIPlayer(room.code))
      io.to(room.code).emit('players_updated', { players: serializePlayers(room.players) })
    })

    socket.on('fill_ai', () => {
      const room = manageAIRoom(socket)
      if (!room) return
      while (room.players.length < room.maxPlayers) joinRoom(room.code, createAIPlayer(room.code))
      io.to(room.code).emit('players_updated', { players: serializePlayers(room.players) })
    })

    socket.on('remove_ai', ({ playerId }) => {
      const room = manageAIRoom(socket)
      if (!room) return
      const target = room.players.find(p => p.id === playerId)
      if (!target?.isAI) { socket.emit('error', { message: 'Target is not an AI player' }); return }
      leaveRoom(room.code, playerId)
      io.to(room.code).emit('players_updated', { players: serializePlayers(room.players) })
    })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx jest ws-integration --forceExit`
Expected: PASS (existing 3 + new AI-management test).
Run: `cd packages/server && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/types.ts packages/server/src/player.ts packages/server/src/ws.ts packages/server/src/__tests__/ws-integration.test.ts
git commit -m "feat(server): host can add/fill/remove AI players"
```

---

### Task 3: 抽出 `applyPlay` / `applyPass`（纯重构）

**Files:**
- Modify: `packages/server/src/ws.ts`
- Test: `packages/server/src/__tests__/ws-integration.test.ts`（复用现有用例）

**Interfaces:**
- Consumes: existing `handlePlay`/`handlePass`/`processPassResult`/`emitRoundResult`/`handleGameOverIfNeeded`/`advanceTurnAndPrompt`.
- Produces: `applyPlay(io, roomCode, game, room, playerId, cards): { success: boolean; error?: string }`; `applyPass(io, roomCode, game, room, playerId): HandlePassResult`.

- [ ] **Step 1: Confirm baseline tests pass**

Run: `cd packages/server && npx jest ws-integration --forceExit`
Expected: PASS (3 tests). This is the regression net for this refactor.

- [ ] **Step 2: Add the shared functions**

In `packages/server/src/ws.ts`, add after `advanceTurnAndPrompt`:

```ts
/** Handle a play for a human OR an AI. Returns the handler result; caller reports errors. */
function applyPlay(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room, playerId: string, cards: Card[]) {
  const result = handlePlay(game, playerId, cards)
  if (!result.success) return result
  clearTurnTimer(roomCode)
  let nextPlayerId = ''
  if (result.roundWinner) {
    const wi = game.players.findIndex(p => p.id === result.roundWinner)
    if (wi >= 0) nextPlayerId = game.players[wi].id
  } else {
    let ni = (game.currentPlayerIndex + 1) % game.players.length
    for (let i = 0; i < game.players.length && game.players[ni].finished; i++)
      ni = (ni + 1) % game.players.length
    nextPlayerId = game.players[ni].id
  }
  const playType = identify(cards)
  io.to(roomCode).emit('play_made', {
    playerId,
    nextPlayerId,
    play: { type: playType?.type || 'single', cards },
    tableCards: game.tableCards,
  })
  if (result.roundWinner) {
    emitRoundResult(io, roomCode, game, result.roundWinner)
    if (handleGameOverIfNeeded(io, roomCode, game)) return result
    emitDrawCards(io, roomCode, game, room)
  }
  if (!game.gameOver) advanceTurnAndPrompt(io, roomCode, game, room, result.roundWinner)
  return result
}

/** Handle a pass for a human OR an AI. */
function applyPass(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room, playerId: string) {
  const result = handlePass(game, playerId)
  if (!result.success) return result
  clearTurnTimer(roomCode)
  processPassResult(io, roomCode, game, room, result)
  return result
}
```

- [ ] **Step 3: Replace the inline bodies in the socket handlers**

Replace the `socket.on('play', …)` body after the guards with:

```ts
      const result = applyPlay(io, currentRoomCode, game, room, currentPlayerId, cards)
      if (!result.success) socket.emit('error', { message: result.error || 'Invalid play' })
```

Replace the `socket.on('pass', …)` body after the guards with:

```ts
      const result = applyPass(io, currentRoomCode, game, room, currentPlayerId)
      if (!result.success) socket.emit('error', { message: result.error || 'Invalid pass' })
```

(The full replacement removes the now-duplicated `clearTurnTimer`/`nextPlayerId`/`play_made`/`round_result`/`advanceTurnAndPrompt` blocks, which now live in `applyPlay`.)

- [ ] **Step 4: Run tests + typecheck**

Run: `cd packages/server && npx jest ws-integration --forceExit && npx tsc --noEmit`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/ws.ts
git commit -m "refactor(server): extract applyPlay/applyPass for human+AI"
```

---

### Task 4: `promptTurn` + Bot 出牌驱动

**Files:**
- Modify: `packages/server/src/ws.ts`
- Test: `packages/server/src/__tests__/ws-integration.test.ts`

**Interfaces:**
- Consumes: `choosePlay` (@79523/engine), `applyPlay`/`applyPass` (Task 3).
- Produces: `promptTurn(io, roomCode, game, room, playerId, extra?)`; `scheduleBotTurn(...)`.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/__tests__/ws-integration.test.ts`:

```ts
  test('a lone host + AI: AI auto-plays after the host leads', async () => {
    process.env.BOT_DELAY_MS = '20'
    try {
      const host = await connectClient()
      host.emit('create_room', { name: 'H', maxPlayers: 2 })
      const { roomCode } = await waitFor<{ roomCode: string }>(host, 'room_created')
      const filled = waitFor<any>(host, 'players_updated')
      host.emit('fill_ai')
      await filled

      const started = waitFor<any>(host, 'game_started')
      host.emit('ready')
      const gs = await started
      const myHand: Card[] = gs.hand
      const smallest = getSmallestCard(myHand)!

      // host plays (may or may not be first to act); keep the game moving
      const sawPlay = waitFor<any>(host, 'play_made', 4000)
      host.emit('play', { cards: [smallest] })
      const pm = await sawPlay
      expect(pm.playerId).toBeTruthy()

      // the AI must take actions on its own → at least one play_made by the AI or a round_result
      const progressed = await Promise.race([
        waitFor<any>(host, 'play_made', 3000),
        waitFor<any>(host, 'round_result', 3000),
      ])
      expect(progressed).toBeTruthy()
    } finally {
      delete process.env.BOT_DELAY_MS
    }
  }, 15000)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx jest ws-integration -t "lone host + AI"`
Expected: FAIL/timeout — AI never acts (no bot driver yet).

- [ ] **Step 3: Implement**

In `packages/server/src/ws.ts`, import the policy:

```ts
import { Rank, calculateScore, isScoreCard, resolveRound, getWinner, BoxerMove, compareCards, identify, choosePlay } from '@79523/engine'
```

Add near `advanceTurnAndPrompt`:

```ts
function botDelayMs(): number {
  return Number(process.env.BOT_DELAY_MS) || 700
}

/** Route a turn to a human (your_turn) or an AI (scheduled bot action). */
function promptTurn(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room, playerId: string, extra: Record<string, unknown> = {}) {
  const rp = room.players.find(p => p.id === playerId)
  if (!rp) return
  if (rp.isAI) { scheduleBotTurn(io, roomCode, game, room, playerId); return }
  const gp = game.players.find(p => p.id === playerId)!
  startTurnTimer(io, roomCode, game, room, playerId)
  io.to(rp.socketId).emit('your_turn', { timeout: 30, hand: gp.hand, deckCount: game.deck.length, ...extra })
}

function scheduleBotTurn(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room, playerId: string) {
  setTimeout(() => {
    if (game.gameOver || game.boxerState) return
    if (game.players[game.currentPlayerIndex]?.id !== playerId) return
    const gp = game.players.find(p => p.id === playerId)
    if (!gp) return
    const cards = choosePlay({ hand: gp.hand, currentBestPlay: game.currentBestPlay })
    const result = cards
      ? applyPlay(io, roomCode, game, room, playerId, cards)
      : applyPass(io, roomCode, game, room, playerId)
    if (!result.success) applyPass(io, roomCode, game, room, playerId)
  }, botDelayMs())
}
```

Replace the direct turn prompts with `promptTurn`:
- `emitGameStart` tail → `promptTurn(io, roomCode, game, room, leadPlayerId)` (remove the `startTurnTimer` + `io.to(...).emit('your_turn'...)` lines and the debug `console.log`).
- `advanceTurnAndPrompt` tail → `promptTurn(io, roomCode, game, room, nextGp.id)` (remove `startTurnTimer` + emit).
- `processPassResult` forcePlay branch → replace `startTurnTimer(...)` + `io.to(room.players[bestIdx].socketId).emit('your_turn', {..., tableCards: game.tableCards})` with `promptTurn(io, roomCode, game, room, gp.id, { tableCards: game.tableCards })`.
- `handlePlayerLeave` tail → `promptTurn(io, roomCode, game, room, gp.id, { tableCards: game.tableCards })`.
- `resetSurrenderTimer` auto-complete tail → `promptTurn(io, roomCode, game, room, leadGp.id)`.
- `processSurrenderReturn` completion tail → `promptTurn(io, roomCode, game, room, leadGp.id)`.
- `startTurnTimer` fallback "must play" tail (it emits `your_turn` to the next player) → `promptTurn(io, roomCode, game, room, nextGp.id)`.

- [ ] **Step 4: Run tests + typecheck**

Run: `cd packages/server && npx jest ws-integration --forceExit && npx tsc --noEmit`
Expected: PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/ws.ts packages/server/src/__tests__/ws-integration.test.ts
git commit -m "feat(server): drive AI turns via promptTurn/scheduleBotTurn"
```

---

### Task 5: 拳王 / 交粮自动化 + 完整对局验证

**Files:**
- Modify: `packages/server/src/ws.ts`
- Test: `packages/server/src/__tests__/ws-integration.test.ts`

**Interfaces:**
- Consumes: `chooseBoxerMove`/`chooseSurrenderGive`/`chooseSurrenderPick`/`chooseSurrenderReturn` (@79523/engine); `maybeResolveBoxer`, `processSurrenderGive/Pick/Return`.
- Produces: `scheduleBotBoxer(io, roomCode, game)`; `scheduleBotSurrender(io, roomCode, game, room)`.

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/__tests__/ws-integration.test.ts`:

```ts
  test('host + 3 AI auto-completes a full game (boxer + surrender included)', async () => {
    process.env.BOT_DELAY_MS = '5'
    try {
      const host = await connectClient()
      host.emit('create_room', { name: 'H', maxPlayers: 4 })
      const { roomCode } = await waitFor<{ roomCode: string }>(host, 'room_created')
      const filled = waitFor<any>(host, 'players_updated')
      host.emit('fill_ai')
      await filled

      const started = waitFor<any>(host, 'game_started')
      host.emit('ready')
      await started

      // No further human input — the table must resolve on its own.
      const gameOver = await waitFor<any>(host, 'game_over', 30000)
      expect(gameOver.scores).toHaveLength(4)
    } finally {
      delete process.env.BOT_DELAY_MS
    }
  }, 40000)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/server && npx jest ws-integration -t "auto-completes a full game"`
Expected: FAIL/timeout — boxer/surrender stall waiting for AI moves.

- [ ] **Step 3: Implement boxer automation**

Import from engine: add `chooseBoxerMove` to the `@79523/engine` import.

Add:

```ts
/** Schedule random moves for AI boxer survivors that haven't submitted yet. */
function scheduleBotBoxer(io: WsServer, roomCode: string, game: NonNullable<Room['game']>) {
  const bs = game.boxerState
  if (!bs) return
  const room = getRoom(roomCode)
  for (const id of bs.currentSurvivors) {
    const rp = room?.players.find(p => p.id === id)
    if (!rp?.isAI || bs.currentMoves.has(id)) continue
    setTimeout(() => {
      const cur = game.boxerState
      if (cur !== bs) return
      if (!cur.currentSurvivors.includes(id) || cur.currentMoves.has(id)) return
      cur.currentMoves.set(id, chooseBoxerMove())
      maybeResolveBoxer(io, roomCode, game)
    }, botDelayMs())
  }
}
```

Call `scheduleBotBoxer(io, roomCode, game)` immediately after each `boxer_start` emission:
- end of `startBoxerRound`
- end of `startBoxerTiebreakRound`
- inside the 2s `setTimeout` of `processBoxerRound` (the `else` branch, after emitting `boxer_start`)
- inside the 2s `setTimeout` of `resolveBoxerTiebreakRound` (after emitting `boxer_start`)

- [ ] **Step 4: Implement surrender automation**

Add:

```ts
/** Auto-act for an AI surrender actor (lose-give / winner-pick / winner-return). */
function scheduleBotSurrender(io: WsServer, roomCode: string, game: NonNullable<Room['game']>, room: Room) {
  const ss = room.surrenderState
  if (!ss) return
  const actorId =
    ss.phase === 'losers_give' ? ss.loserIds[ss.currentPairIndex]
    : ss.winnerIds[ss.currentPairIndex]
  const actor = room.players.find(p => p.id === actorId)
  if (!actor?.isAI) return
  setTimeout(() => {
    if (room.surrenderState !== ss) return
    const gp = game.players.find(p => p.id === actorId)
    if (!gp) return
    if (ss.phase === 'losers_give') {
      processSurrenderGive(io, roomCode, actorId, chooseSurrenderGive(gp.hand), room, game)
    } else if (ss.phase === 'winners_pick' && ss.surrenderedCards.length > 0) {
      processSurrenderPick(io, roomCode, actorId, chooseSurrenderPick(ss.surrenderedCards.map(sc => sc.card)), room, game)
    } else if (ss.phase === 'winners_return' && gp.hand.length > 0) {
      processSurrenderReturn(io, roomCode, actorId, chooseSurrenderReturn(gp.hand), room, game)
    }
  }, botDelayMs())
}
```

Import the remaining policy functions: add `chooseSurrenderGive, chooseSurrenderPick, chooseSurrenderReturn` to the `@79523/engine` import.

Call `scheduleBotSurrender(io, roomCode, game, room)` right after `resetSurrenderTimer(io, roomCode, game, room)` inside `sendSurrenderPrompt`.

- [ ] **Step 5: Run tests + typecheck**

Run: `cd packages/server && npx jest --forceExit && npx tsc --noEmit`
Expected: all PASS, exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/ws.ts packages/server/src/__tests__/ws-integration.test.ts
git commit -m "feat(server): auto-play AI in boxer and surrender"
```

---

### Task 6: 客户端房主 UI

**Files:**
- Modify: `packages/client/src/types/index.ts`
- Modify: `packages/client/src/composables/useRoom.ts`
- Modify: `packages/client/src/views/RoomView.vue`

**Interfaces:**
- Consumes: server events `add_ai`/`fill_ai`/`remove_ai`; `players_updated` payload now carries `isAI`.
- Produces: `useRoom().addAI()/fillAI()/removeAI(id)`.

- [ ] **Step 1: Extend the player type**

`packages/client/src/types/index.ts` — add to `PlayerInfo`:

```ts
  isAI?: boolean
```

- [ ] **Step 2: Add composable actions**

`packages/client/src/composables/useRoom.ts` — after `startNewGame()`:

```ts
  function addAI() { socket.value?.emit('add_ai') }
  function fillAI() { socket.value?.emit('fill_ai') }
  function removeAI(id: string) { socket.value?.emit('remove_ai', { playerId: id }) }
```

And export them: add `addAI, fillAI, removeAI` to the returned object.

- [ ] **Step 3: Add the RoomView UI**

`packages/client/src/views/RoomView.vue`:

- Destructure the new functions: `const { roomCode, players, amReady, myId, ready, setupListeners, addAI, fillAI, removeAI } = useRoom()`.
- Player list row: show AI marker and a remove button:

```html
        <span class="player-name">{{ p.name }}{{ p.isHost ? ' 👑' : '' }}{{ p.isAI ? ' 🤖' : '' }}</span>
        <button v-if="isHost && p.isAI" class="remove-ai-btn" @click="removeAI(p.id)">移除</button>
```

- Host AI control row (place below `.player-section`, above the leaderboard):

```html
    <div v-if="isHost" class="ai-controls">
      <button class="ai-btn" @click="addAI">＋AI</button>
      <button class="ai-btn fill" @click="fillAI">补满 AI</button>
    </div>
```

- Add scoped styles:

```css
.ai-controls { display: flex; gap: 0.5rem; margin-top: 0.75rem; }
.ai-btn {
  flex: 1; padding: 0.6rem; font-size: 0.85rem; font-weight: 600;
  border: 1px solid rgba(96,165,250,0.4); border-radius: 10px;
  background: rgba(96,165,250,0.12); color: #93c5fd; cursor: pointer; transition: all 0.15s;
}
.ai-btn.fill { border-color: rgba(251,191,36,0.4); background: rgba(251,191,36,0.12); color: #fbbf24; }
.ai-btn:hover { transform: translateY(-1px); }
.remove-ai-btn {
  padding: 0.15rem 0.5rem; font-size: 0.72rem; border: 1px solid rgba(239,68,68,0.35);
  border-radius: 6px; background: rgba(239,68,68,0.1); color: #f87171; cursor: pointer;
}
```

- [ ] **Step 4: Typecheck + build the client bundle**

Run: `cd packages/client && npx vue-tsc --noEmit && npx vite build`
Expected: exit 0, build succeeds.

- [ ] **Step 5: Manual smoke test**

With the dev server running (`npx pnpm dev`), open the client in a browser, create a 4-player room, click **补满 AI**, verify 3 rows show `🤖` + `移除`, click **准备**, and confirm the game starts and plays itself. Then click **移除** on an AI in the waiting room next round to confirm removal.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/types/index.ts packages/client/src/composables/useRoom.ts packages/client/src/views/RoomView.vue
git commit -m "feat(client): host AI controls in RoomView"
```

---

## Self-Review

**Spec coverage:**
- AI 数据模型（`isAI`、无 socket、恒 ready、跳过 sync/draw）→ Task 2。
- 房主事件 `add_ai`/`fill_ai`/`remove_ai` + 房主/等待阶段校验 → Task 2。
- `promptTurn` 统一入口 + 替换所有 `your_turn` 直发点 + `applyPlay`/`applyPass` 复用 → Task 3、4。
- 拳王/交粮自动化 → Task 5。
- 纯策略 `engine/src/ai.ts` → Task 1。
- 客户端 RoomView UI + `PlayerInfo.isAI` + useRoom 方法 → Task 6。
- 测试（engine 单测 + server 集成）→ Task 1/2/4/5。
- 边界（房满、非房主、开局后、删除真人）→ Task 2 测试覆盖。

**与 spec 的偏差（已知且有意）：** `AiView` 去掉了 `isFirstTrick` —— 领出打最小单张天然满足"首墩必须带最小牌"，该字段无行为差异，故不引入以免死字段。其余签名一致。

**类型一致性检查：** `applyPlay`/`applyPass` 的返回类型在各任务中一致；`manageAIRoom`/`createAIPlayer`/`promptTurn`/`scheduleBotBoxer`/`scheduleBotSurrender` 名称与 Task 间引用一致；`choosePlay`/`chooseBoxerMove`/`chooseSurrender*` 与 Task 1 导出一致。

**Placeholder 扫描：** 无 TBD/TODO；每个代码步骤含实际代码。

**注意：** Task 4/5 依赖真实计时器与 `BOT_DELAY_MS`；集成测试用 5–20ms 压缩延迟。整局自动对局最坏 `30s` 超时 → 该用例超时设为 40s。
