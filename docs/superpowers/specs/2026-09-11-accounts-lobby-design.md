# 79523 — 账号体系 / 大厅 / 持久化 / 全局排名 设计文档

## 元信息

- **项目：** 79523 在线对战平台（用户体系与大厅扩展）
- **日期：** 2026-09-11
- **阶段：** 设计已确认，待 writing-plans 输出分阶段实现计划
- **依赖设计：** `docs/superpowers/specs/2026-06-05-79523-design.md`、`docs/superpowers/specs/2026-09-11-ai-players-design.md`

## 1. 目标

1. **注册 / 登录**，区分**管理员**与**普通用户**；管理员拥有用户管理等权限。
2. **大厅页面**（美化）：查看全部用户（含在线状态）与已创建房间，创建 / 加入房间。
3. **战绩持久化**：用户只要不注销（删除账号），`胜局数` 与 `拳王数` 永久保留（服务重启不丢）。
4. **全局排名**：排名不再局限于单个房间，而是所有玩家。

## 2. 非目标

- 不做第三方登录（OAuth）、邮箱验证、找回密码。
- 不做聊天/好友/私信。
- 不做多实例/横向扩展（单进程 + 单文件 SQLite）。
- 房间本身**不落库**（仍在内存），只有账号与战绩持久化。
- 不做观战、匹配算法（仍手动建房）。

## 3. 现状与选型

- 当前服务端**纯内存**：`rooms`/`players` 两个 Map，重启即丢；玩家 id 由 socketId 派生；无账号概念。
- 现状入口：`HomeView` 填昵称 → 选人数 → 建房/加入；`ready` 全员准备自动开局。

**新增依赖（server）：**
- `better-sqlite3`：同步 SQLite 客户端，单文件、零运维。
- `bcryptjs`：纯 JS 密码哈希（免 native 编译）。
- `jsonwebtoken`：签发/校验 JWT。

数据库文件：`packages/server/data/app.db`（`data/` 加入 `.gitignore`）。

## 4. 强制登录

未登录用户只能访问登录/注册页；所有游戏相关页面与接口都要求已鉴权。原"填昵称免登录"流程被移除。

## 5. 数据模型（SQLite）

```sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,       -- uuid
  username      TEXT UNIQUE NOT NULL,   -- 登录名，2-12，中文/字母/数字/下划线
  password_hash TEXT NOT NULL,          -- bcrypt
  role          TEXT NOT NULL,          -- 'admin' | 'user'
  wins          INTEGER NOT NULL DEFAULT 0,   -- 累计胜局（每局最终第一名）
  boxer_wins    INTEGER NOT NULL DEFAULT 0,   -- 累计拳王
  created_at    INTEGER NOT NULL
);
```

**启动 seed（管理员 bootstrap，环境变量方案）**：启动时若设置了 `ADMIN_USERNAME` 且 `ADMIN_PASSWORD`，且该用户名尚不存在 → 创建 `role='admin'` 账号。其余注册一律 `role='user'`。未配置且库中无任何 admin 时，日志告警（不自动提升任何用户）。

## 6. 鉴权（REST + Socket）

- **REST**
  - `POST /api/auth/register` `{username,password}` → 创建普通用户 → 返回 `{token,user}`
  - `POST /api/auth/login` `{username,password}` → 返回 `{token,user}`
  - `GET  /api/auth/me`（需鉴权）→ 当前用户
  - `DELETE /api/auth/me`（需鉴权）→ **注销（删除账号）**，见 §11
- **令牌**：JWT，payload `{ uid, role }`，有效期 7 天。前端存 `localStorage`。
- **REST 鉴权中间件**：`Authorization: Bearer <token>` → 校验后挂 `req.user`。
- **Socket 鉴权**：`io.use((socket,next)=>…)` 读取 `socket.handshake.auth.token`，校验失败 `next(new Error('unauthorized'))`。前端 `io('/', { auth: { token } })`。
- **在线状态**：内存 `Map<accountId, Set<socketId>>`；连接建立即在线，断开且无剩余连接则离线。用于大厅在线徽标与管理端踢人。
- **用户信息**：对外返回 `{ id, username, role, wins, boxerWins, online }`（**永不含 `password_hash`**）。

## 7. 角色与管理员权限

- **普通用户**：大厅、全局排名、创建/加入房间、对局、注销自己账号。
- **管理员**（在普通用户之上）：
  - `GET    /api/admin/users` — 全部用户列表（含在线、战绩、角色）
  - `DELETE /api/admin/users/:id` — **删除用户**（硬删，连带战绩）
  - `POST   /api/admin/users/:id/reset` — **重置该用户战绩**（wins/boxerWins=0）
  - `PUT    /api/admin/users/:id/role` `{role}` — **提升/降级管理员**
  - `DELETE /api/admin/rooms/:code` — **解散房间**（销毁房间并通知房内玩家）
- **边界**：管理员**不能删除或降级自己**；系统始终保留至少一个 admin。所有 `/api/admin/*` 二次校验 `role==='admin'`。

> 注：曾有的 `POST /api/admin/kick/:userId`（踢出在线玩家）已移除；删除账号仍会断开其 socket。

## 8. 房间流程（本次修订）

- **创建房间不选人数**：房间容量固定上限 **6**。
- **开局 = 房间内 ≥ 2 人 + 房间内任意玩家点「开局」**（不限房主）。取消"全员准备"机制。
- **牌副数按实际开局人数**（沿用 `createDeck`：<4 人 1 副，≥4 人 2 副）。
- **下一局同理**：仍由任意玩家点「开局」；上一局遗留的交粮（`pendingSurrender`）照旧先执行。
- **AI**：仍**仅房主**可添加（`add_ai`/`fill_ai` 到 6/`remove_ai`）；AI 计入"≥2 人"，不需 ready。
- **房间身份**：房间内玩家 id = **账号 id**（不再由 socketId 派生），保证战绩归属稳定与断线重连；`isHost` 归属建房者（`room.hostId`）。
- **一个账号同时只在一个房间**；断线后凭 token 重连即恢复身份与座位（不再依赖旧 socketId 映射）。

服务端事件调整：
- 删除 `ready` 与房主专属 `start_new_game` 的旧语义。
- 新增 `start_game`（任意已鉴权且在该房间的玩家）：校验 `players.length >= 2 && room.game == null` → 开局（含 `pendingSurrender` 流程）→ 否则回 `error`。

**房间生命周期（避免僵尸房）**：
- **最后一个真人离开时立即解散房间**（连同残留 AI 一并销毁）；不再有 10 分钟空置保留期，`emptiedAt` / `cleanupStaleRooms` / 定时器均已移除。
- **一个账号同一时刻只在一个房间**：`create_room` / `join_room` / `reconnect` 之前先 `leaveCurrentRoom()` 退出旧房间。否则账号共享的 `Player` 对象会同时挂在两个房间，其 `socketId` 指向错误牌桌，`your_turn` / `full_state` 串房（表现为“手牌变来变去”）。
- **主动离开**：`leave_room` 走同一 `leaveCurrentRoom()`；对局中先 `handlePlayerLeave` 把回合并给下家。
- 真人玩家**断线在对局中不移出**（方案 B），仅等待其重连；轮到他时回合计时器照常自动出牌。

## 9. 大厅（需求 2）

登录后进入 `/lobby`，顶部标签：**大厅 / 全局排名 / 管理（仅 admin 可见）**。

**大厅标签内容：**
- **用户列表**：全部注册用户，每行 `用户名 + 在线/离线徽标 + 最近 24 小时对局时长 + 胜局 + 拳王`。
- **房间列表**：每行 `房号 · 房主 · 当前人数/6 · 等待中|进行中`；**等待中**房间可点「加入」，**进行中**置灰不可加入；房号照旧可直接输入加入。**空置房间（0 真人）不在此列出。**
- **创建房间**（无人数选择）、**房号加入**。
- 实时刷新：服务端向已鉴权连接广播 `lobby_users_updated` / `lobby_rooms_updated`（用户上下线、房间创建/加入/离开/解散时触发）。

## 10. 全局排名（需求 4）

- `GET /api/leaderboard?metric=wins|boxerWins|wins24h`（需鉴权）。
- **三榜切换**：
  - 胜局榜：`ORDER BY wins DESC, boxer_wins DESC`
  - 拳王榜：`ORDER BY boxer_wins DESC, wins DESC`
  - **近24小时榜**（后续需求）：按最近 24 小时**胜局数**降序，并列时按 24 小时拳王数；同行显示 24 小时胜局与拳王数。
- 每行显示 `名次 · 用户名 · 胜局 · 拳王 · 在线点`（近24小时榜改显该窗口的胜局/拳王）。累计榜数据源为 DB 查询，24 小时榜由 `play_log` 聚合。

## 11. 战绩持久化（需求 3）

- 一局结束时（`finishBoxerFlow` 已算出最终第一名与拳王归属），把对应账号的 `wins` / `boxer_wins` **落库累加**，同时更新房间内展示。
- **登出（logoff）**：只清前端 token，账号与战绩保留。再次登录仍在。
- **注销（删除账号）**：删除账号记录，战绩随之消失；同时断其 socket、若在某房间则移出。
- 被管理员删除/重置同理即时生效。
- **AI 玩家不是账号**：不计入持久化与全局排名（其房间内战绩仅用于本房间展示）。

### 11.1 对局时长（后续需求）

- **口径**：一局从「开局」到「结算结束」（`finishBoxerFlow`）的时长，计入该局内的每个**真人玩家**；AI 不计。
- **存储**：`play_log(user_id, at, seconds, wins, boxer_wins)`，每局结束时为每位真人玩家写入一行（`at` = 结算时刻）。
- **展示**：大厅用户列表显示「最近 24 小时」内结算的对局累计时长（`playSeconds24h = SUM(seconds WHERE at >= now - 24h)`），格式化为 `N秒 / N分 / N小时M分`；全局排名亦有「近24小时」榜（按 `SUM(wins)` 排序）。
- 随 `publicUser` 一并下发：`/api/users`、`/api/leaderboard`、`lobby_users_updated` 广播（含 `playSeconds24h / wins24h / boxerWins24h`）。

## 12. 客户端结构与改造

- **新页面**：
  - `LoginView`（`/login`）：登录 / 注册切换。
  - `LobbyView`（`/lobby`）：三标签（大厅 / 全局排名 / 管理）。
  - `AdminView` 可作为 Lobby 的标签内容组件（用户表格 + 房间列表 + 操作）。
- **路由守卫**：无有效 token → 跳 `/login`；已登录访问 `/login` → 跳 `/lobby`。
- **状态**：新增 Pinia `auth` store（`token`、`user`）；统一 `fetch` 封装自动附加 `Authorization`，401 → 清 token 回登录页。
- **Socket**：连接时携带 `auth: { token }`；鉴权失败回登录页。
- **替换**：原 `HomeView`（填昵称建房/加入）被登录 + 大厅取代；`RoomView`、`GameView` 保留，改为从大厅进入。
- **RoomView 改造**：去掉「准备」按钮，改为所有玩家可见的「开局」按钮（`players.length < 2` 置灰）；房主额外可见 AI 控件。

## 13. 对现有代码 / 测试的影响

- `createPlayer(socketId,name)` → 改为基于账号创建（`id=账号id`、`name=username`）；`players` Map 语义调整或移除。
- 现有 REST `/api/rooms`、`create_room`/`join_room` 需鉴权；建房不再接收 `maxPlayers`。
- **`ws-integration.test.ts`**：无令牌连接会被 socket 鉴权拒绝 → 需改为先注册/登录取 token 再连；相关断言更新。
- `room.test.ts`、`game-machine`、`game-simulation` 不涉及鉴权，基本不受影响。
- `docs/.../2026-06-05-79523-design.md` §11 的"无登录/无数据库/无大厅"条目需修订（见 §16）。

## 14. 安全与边界

- 密码仅存 bcrypt 哈希；登录失败统一提示"用户名或密码错误"。
- 用户名唯一、`[\p{L}\p{N}_]{2,12}`（允许中文）；密码≥6 位。
- 令牌过期（7 天）需重新登录；`/api/*` 与 socket 均校验。
- 管理员接口全部 `role==='admin'` 校验 + 防自删/自降。
- 被删/被踢用户：断开 socket，前端下个请求 401 → 回登录页。
- SQLite 使用参数化查询，避免注入。

## 14.1 断线与重连（移动端）

- **socket.io 服务端参数**：`pingInterval 25s / pingTimeout 60s`，容忍手机切后台约 1 分钟不回应 ping。
- **对局中不移出（方案 B）**：掉线只标记 `connected=false`，**座位保留到本局结束**——但**仅当还有其它真人在线**时；若全体真人都已掉线，宽限期（`DISCONNECT_KICK_MS`，默认 180s）到即**放弃本局并清座/解散房间**（否则对局会以 `TURN_TIMEOUT_MS`/回合自动打很久，房间一直显示“进行中”）。缺席玩家的回合由回合计时器（默认 30s）自动 pass / 出最小牌，保证对局不卡死。
- **删账号会连房间一起清**：`DELETE /auth/me` 与 `DELETE /admin/users/:id` 除了断 socket，还调 `removeAccountFromRooms()` 把该账号从房间/对局中移除，避免遗留“僵尸房间”。
- **重连即接管**：客户端 socket `connect` 后，若当前在 `/room/:code` 或 `/game/:code`，自动 `emit('reconnect', { roomCode })`；服务端更新 `socketId`、置 `connected=true`、重新加入房间、广播 `players_updated`、并向该 socket 单发 `full_state`（含手牌与桌面 `tableCards`），玩家随即恢复操作。若重连时**无进行中对局**（`room.game` 为空），则补发 `next_game_lead`，客户端回到房间页（否则会卡在已结束的对局页）。
- **对局中不接受新玩家**：`join_room` 在 `room.game` 存在时拒绝（否则新座位不在 `game.players` 中，会破坏回合路由）；重连必须走 `reconnect`。
- **对局页可作入口**：`GameView` 挂载时也会 `connect()` 并注册 room+game 监听（`useRoom.setupListeners`）。手机切应用时后台页常被系统重载，若对局页不建连/不注册监听，重连后就是一个空壳（无手牌、无玩家）。
- **房间内玩家对象唯一**：`createPlayerForAccount` 复用已有对象，保证全局账号表与 `room.players` 不会指向不同对象（否则 `socketId`/`connected` 会错位）。
- **重连后恢复展示**：`full_state` 含 `roomCode`、`tablePlays`（桌面每张牌的玩家归属，用于按玩家配色）与 `playerNames`；客户端收到 `full_state` 时若不在对局页则跳转 `/game/:code`（修复“掉线玩家漏掉 `game_started`、恢复后停在房间页”）。若重连时正处于拳王环节，服务端额外补发 `boxer_start`（带 `submitted` 标记）；若正处于交粮环节，补发 `surrender_start`（不重置其超时）。
- **对局内掉线提示**：对局中玩家状态（`connected`）随 `game_started` / `full_state` / `players_updated` 下发；`PlayerSlot` 对离线玩家灰显并显示「📴 掉线」，轮到离线玩家时 `TurnIndicator` 显示「⏳ XX 掉线中，等待重连…」（回合计时器仍会替他自动出牌）。
- **交粮/拳王 UI 由 store 驱动**:`SurrenderOverlay` 不自己挂 socket 监听(子组件挂载早于父组件 `connect()`,重载后会漏掉事件),改由 `useGame` 写入 store(`surrenderActive/phase/role/hand/info/pickCards`),遮罩只读 store;重连补发的 `surrender_start` 因此能正常恢复。
- **回合计时器自动出牌**：使用引擎的 `getSmallestCard`（同点数按花色比较）而非按 rank 手写取最小；否则首回合"必须包含最小牌"校验会失败，导致该回合不再推进（双方都挂机/离线时对局死住）。
- **拳王出拳计时器按回合清理**：`game.boxerState` 在整个拳王阶段是**同一个对象**（就地复用），所以 `scheduleBotBoxer` 的 `cur !== bs` 守卫拦不住上一轮的计时器；回合结算/新回合时调用 `clearBoxerTimers`（`processBoxerRound`/`resolveBoxerTiebreakRound`/`startBoxer*Round`/`finishBoxerFlow`），否则上一轮为真人排的超时会**在后面的回合提前替他出拳**（玩家“没机会点”）。
- **交粮超时自动完成**：使用上一局名次（`pendingSurrender` 的 `loserIds/winnerIds`，固定配对 loser i ↔ winner i）；不能按新一局分数排序（开局分数全 0，会等于随机配对）；赢家无可回牌时回退本次给牌，保证手牌数不变。
- **主动离开**：`leave_room` 显式移出房间；若在对局中则先 `handlePlayerLeave` 把回合并给下家。（断线**不**触发此路径。）
- **本局结束后**：`finishBoxerFlow` 为仍离线的座位重新排定移除定时器（`DISCONNECT_KICK_MS`，默认 180s），到点仍未回来才移出房间。
- **在线状态**：仍以 socket 集合判定（见 §7/§9）；断线即离线，重连即在线。

## 15. 测试策略

- **server 单测**：db 层（内存 SQLite）CRUD；注册/登录（含重复用户名、错误密码）；token 校验；管理员权限（含不可自删、非 admin 被拒）；排名查询排序；游戏结束写回战绩。
- **server 集成**：无 token socket 被拒；带 token 建房/对局；任意玩家 `start_game`；管理员删用户 / 踢人；注销后 token 失效。
- **client**：auth store（登录/登出/401 处理）、登录表单校验、大厅用户/房间列表渲染、开局按钮可用性。

## 16. 与既有设计文档的冲突修订

`docs/superpowers/specs/2026-06-05-79523-design.md` §11「不做的事」中：
- "无登录/注册（昵称即可）" → **改为有账号体系**。
- "无数据库持久化（重启丢失房间）" → **账号与战绩持久化**（房间仍不落库）。
- "无大厅匹配（仅房间码加入）" → **有大厅**（房间列表 + 点击加入 + 房号加入）。
- "无观战模式" 等其余条目不变。

## 17. 不做的事

- 无 OAuth / 邮箱验证 / 找回密码。
- 无聊天、好友、私信。
- 无多实例部署 / 外部数据库。
- 房间不落库；无房间历史。
- 不改动出牌/计分/交粮/拳王规则本身。
