# 79523 — 房主添加 AI 玩家 设计文档

## 元信息

- **项目：** 79523 在线对战平台（延伸功能）
- **日期：** 2026-09-11
- **阶段：** 设计已确认，待 writing-plans 输出实现计划
- **依赖设计：** `docs/superpowers/specs/2026-06-05-79523-design.md`

## 1. 目标

房主可在**等待阶段**添加 AI 玩家，用于单人测试与独自游玩。

- AI 在**出牌、拳王、交粮**全流程自动行动（用户选择：全流程自动）。
- 房主可：**＋AI（逐个）**、**一键补满**、**移除指定 AI**。
- AI 是房间内的一等玩家：占用座位、参与切牌副数、计分与胜负统计。

### 非目标

- 不做难度选择（策略固定为"简单偏好"）。
- 不做 AI 自定义命名（默认 `电脑1/电脑2…`）。
- 不让非房主添加/移除 AI。
- 不在对局进行中添加/移除 AI。

## 2. 数据模型

`packages/server/src/types.ts`

```ts
interface Player {
  // …existing…
  isAI?: boolean
}
```

AI 玩家字段：`id` 唯一、`socketId: ''`、`connected: true`、`ready: true`、`isHost: false`、`isAI: true`、`name: 电脑N`。

**因为 AI 就是 `room.players` 里的普通玩家**，以下全部自动适配，无需改动：牌副数（<4 人 1 副 / ≥4 人 2 副）、发牌、计分、`wins`/`boxerWins` 统计、交粮配对、拳王。

`serializePlayers()` 增加 `isAI` 字段随 `players_updated` / `player_joined` 广播。

### 就绪语义

AI **恒为已就绪**：`resetPlayerReady`（新一局重置）与 `resetRoomForNewGame` 跳过 AI，保证真人点准备后 `every(ready)` 立即满足即可开局。

### socket 相关跳过

- `syncPlayerSockets()` 跳过 AI（无 socket，避免 "socket NOT FOUND" 噪音）。
- `emitDrawCards()` 跳过 AI（其手牌只存在于服务端，无需推送）。

## 3. 服务端事件（房主限定）

`ClientEvents` 新增，全部要求 `当前玩家.isHost && room.game === null`（等待阶段）：

| 事件 | 载荷 | 行为 |
|---|---|---|
| `add_ai` | — | 追加 1 个 AI；房满则忽略并回 `error` |
| `fill_ai` | — | 循环追加直到 `players.length === maxPlayers` |
| `remove_ai` | `{ playerId }` | 移除指定 AI（校验该 id 确为 AI）；走 `leaveRoom` 语义 |

成功后广播 `players_updated`。所有操作二次校验（房主、等待阶段、目标为 AI），非法即 `error` 事件。

## 4. 回合驱动（核心）

当前"轮到谁"直接 `io.to(socketId).emit('your_turn')`，散落在多处。改为统一入口：

```ts
// ws.ts
function promptTurn(io, roomCode, game, room, playerId) {
  const rp = room.players.find(p => p.id === playerId)
  if (!rp) return
  if (rp.isAI) {
    scheduleBotTurn(io, roomCode, game, room, playerId) // 见下
  } else {
    const gp = game.players.find(p => p.id === playerId)!
    startTurnTimer(io, roomCode, game, room, playerId)   // 保持现有 30s 兜底
    io.to(rp.socketId).emit('your_turn', { timeout: 30, hand: gp.hand, deckCount: game.deck.length })
  }
}
```

**替换所有 `your_turn` 直发点**：`emitGameStart`、`advanceTurnAndPrompt`、`handlePlayerLeave`、`processPassResult` 的 forcePlay 分支、`processSurrenderReturn` 完成处。

### 复用出牌/过牌逻辑

`ws.ts` 现把"出牌后的广播与推进"内联在 `socket.on('play')`，过牌在 `socket.on('pass')`→`processPassResult`。抽出共享函数，使真人与 AI 走**完全相同**的路径：

```ts
function applyPlay(io, roomCode, game, room, playerId, cards)  // 广播 play_made + 结算 + advanceTurnAndPrompt
function applyPass(io, roomCode, game, room, playerId)          // handlePass → processPassResult
```

`socket.on('play')` / `socket.on('pass')` 校验后调用它们；`scheduleBotTurn` 也调用它们。

### Bot 调度

```ts
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS) || 700

function scheduleBotTurn(io, roomCode, game, room, playerId) {
  setTimeout(() => {
    // 陈旧校验：仍轮到该 AI 且对局未结束
    if (game.gameOver || game.boxerState) return
    if (game.players[game.currentPlayerIndex]?.id !== playerId) return
    const gp = game.players.find(p => p.id === playerId)
    if (!gp) return
    const cards = choosePlay({ hand: gp.hand, currentBestPlay: game.currentBestPlay, isFirstTrick: game.isFirstTrick })
    if (cards) applyPlay(io, roomCode, game, room, playerId, cards)
    else applyPass(io, roomCode, game, room, playerId)
  }, BOT_DELAY_MS)
}
```

AI 的 30s 兜底计时器**不需要**（bot 会在 `BOT_DELAY_MS` 后行动）。但保留现有 `startTurnTimer` 逻辑用于真人。

## 5. 拳王 / 交粮自动化

### 拳王

`startBoxerRound` / `startBoxerTiebreakRound` 在向参与者发 `boxer_start` 后调用 `scheduleBotBoxer(io, roomCode, game)`：

- 对每个"是 AI 且尚未出拳"的幸存者，延迟后 `bs.currentMoves.set(id, chooseBoxerMove())`；
- 之后调用 `maybeResolveBoxer(io, roomCode, game)`，与真人提交走同一结算路径。

### 交粮

`sendSurrenderPrompt()` 在把 `surrender_start` 发给真人 actor 的同时，若 actor 是 AI，则延迟 `BOT_DELAY_MS` 后自动执行：

| 阶段 | AI 行为 | 调用 |
|---|---|---|
| `losers_give` | 交出手牌最大单张 | `processSurrenderGive(..., chooseSurrenderGive(hand))` |
| `winners_pick` | 从已上缴牌中挑最大的一张 | `processSurrenderPick(..., chooseSurrenderPick(surrendered))` |
| `winners_return` | 还回自己最小的一张 | `processSurrenderReturn(..., chooseSurrenderReturn(hand))` |

现有 15s 自动完成计时器保留为兜底。

## 6. AI 策略（`packages/engine/src/ai.ts`，纯函数）

```ts
interface AiView { hand: Card[]; currentBestPlay: Play | null; isFirstTrick: boolean }

export function choosePlay(view: AiView): Card[] | null
export function chooseBoxerMove(rand?: () => number): BoxerMove
export function chooseSurrenderGive(hand: Card[]): Card       // 最大单张
export function chooseSurrenderPick(cards: Card[]): Card      // 最大
export function chooseSurrenderReturn(hand: Card[]): Card     // 最小
```

**choosePlay 规则**

1. **需领出**（`currentBestPlay === null`）：
   - 若整手牌能构成合法牌型 → 直接打出（能走完）；
   - 否则打最小单张（首墩规则要求包含最小牌，故打最小单张必合法）。
2. **需跟牌**：枚举所有合法组合，过滤 `beats(candidate, currentBestPlay)`，选"最小能压过"的组合（先比 `primaryRank`，同则比花色）；无可压过则返回 `null`（过牌）。

组合枚举按 rank 分组生成单张/对子/三条/单车/根号，用现有 `identify` 校验合法性。复用 `compareCards` / `getSmallestCard` / `getLargestSingle` 语义。

## 7. 客户端

`packages/client/src/types/index.ts`：`PlayerInfo` 增 `isAI?: boolean`。

`RoomView.vue`：当 `isHost && 未开局` 时，在玩家列表/底部显示 AI 控制区：
- `＋AI`（`emit('add_ai')`）
- `补满 AI`（`emit('fill_ai')`；**无需客户端提供人数** —— 服务端按 `room.maxPlayers` 自行补满）
- 每个 AI 行内 `移除`（`emit('remove_ai', { playerId })`）
- AI 名字前缀 `🤖`

`useRoom.ts` 增加 `addAI() / fillAI() / removeAI(id)` 包装 emit。

`RoomView` 的 `isHost` 已存在，可直接复用。

## 8. 测试策略（TDD）

- **engine** `ai.test.ts`：领出最小单张、首墩含最小牌、能走完则打出、跟牌选最小可压组合、压不过则 pass、`chooseSurrender*` 取值、`chooseBoxerMove` 注入 rng。
- **server 集成** `ws-integration.test.ts` 扩展：
  - 房主 `add_ai`/`fill_ai`，非房主被拒，房满被拒，开局后被拒，`remove_ai` 生效；
  - 房主 + AI：准备后开局，AI 在 `BOT_DELAY_MS`（测试置小值）后自动出牌，牌局推进（出现 `play_made` / `round_result`）；
  - 一台真人 + 3 AI 能自动打完一整局（出现 `game_over`），拳王与交粮自动完成。
- **server 单测**：`applyPlay`/`applyPass` 等价性（真人路径不回归）。

## 9. 边界情况

| 场景 | 处理 |
|---|---|
| 房满再 `add_ai`/`fill_ai` | 忽略 + `error` |
| 非房主调用 | 拒绝 + `error` |
| 对局中调用 | 拒绝 + `error` |
| `remove_ai` 传入真人 id | 拒绝 |
| AI 手上仅剩可打出的组合 | 直接打出走完 |
| AI 被淘汰 / 出完 | 沿用现有 finished 跳过逻辑 |
| Bot 定时器触发时状态已变（被踢/换人/已结算） | 陈旧校验后直接 return |
| 下一局重置 | AI 保持 `ready=true` |

## 10. 不做的事

- 无难度等级（固定单一策略）。
- 无 AI 观战/托管真人（仅房主显式添加的 AI 玩家）。
- 不改动出牌规则、计分、交粮规则本身。
