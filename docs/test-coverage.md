# 测试覆盖报告

> 生成时间：2026-06-07 | 版本：v0.1  
> 总计：**216 测试**（引擎 71 + 服务端 101 + 客户端 44）

---

## 一、引擎层测试（vitest）— 71 tests

**路径**: `packages/engine/src/__tests__/`

### 1.1 deck.test.ts — 牌堆 (9 tests)

| # | 测试 | 验证点 |
|---|------|--------|
| 1 | `createDeck > 52 cards for 2-3 players` | <4人用1副牌 |
| 2 | `createDeck > 104 cards for 4-6 players` | >=4人用2副牌 |
| 3 | `createDeck > each rank appears 4 times per deck` | 每点数每花色各1张 |
| 4 | `shuffle > same length` | 洗牌不改数量 |
| 5 | `shuffle > same multiset` | 洗牌不改牌面组合 |
| 6 | `shuffle > does not mutate original` | 不可变性 |
| 7 | `draw > draws N cards` | 正常抽牌 |
| 8 | `draw > draw 0 returns empty` | 抽0张 |
| 9 | `draw > draw more than available returns all` | 超额抽牌 |

### 1.2 types.test.ts — 类型定义 (8 tests)

| # | 测试 | 验证点 |
|---|------|--------|
| 1 | `Suit ordering > Spade is the highest suit (0)` | 黑桃最大 |
| 2 | `Suit ordering > Diamond is the lowest suit (3)` | 方块最小 |
| 3 | `Rank ordering > Seven is the highest rank (12)` | 7最大 |
| 4 | `Rank ordering > Four is the lowest rank (0)` | 4最小 |
| 5 | `Rank ordering > Nine is second highest (11)` | 9第二 |
| 6 | `Rank ordering > Five is third highest (10)` | 5第三 |
| 7 | `HandType values > all hand types defined` | 牌型枚举 |
| 8 | `BoxerMove values > all moves defined` | 拳王手势枚举 |

### 1.3 compare.test.ts — 比较 (13 tests)

| # | 测试 | 验证点 |
|---|------|--------|
| 1 | `compareCards > higher rank wins` | 点数大胜 |
| 2-4 | `compareCards > same rank: suit order` | 同点比花色 |
| 5 | `compareCards > same suit and rank returns 0` | 同卡相等 |
| 6-8 | `compareCards > rank chain: 7>9>5>2` | 点数链 |
| 9 | `full card order > ascending power` | 完整牌序 |
| 10 | `suit order > Spade > Heart > Club > Diamond` | 花色序 |
| 11-13 | `getSmallestCard` | 最小牌选择 |

### 1.4 score.test.ts — 计分 (11 tests)

| # | 测试 | 验证点 |
|---|------|--------|
| 1-3 | `isScoreCard > 5/10/K is score card` | 分牌识别 |
| 4-5 | `isScoreCard > 7/A is not` | 非分牌 |
| 6 | `calculateScore > 5=5, 10=10, K=10` | 分牌分值 |
| 7 | `calculateScore > non-score cards = 0` | 非分牌0分 |
| 8 | `calculateScore > empty = 0` | 空数组0分 |
| 9 | `getScoreCards > filters score cards` | 过滤分牌 |
| 10-11 | `needsBoxer` | 拳王触发条件 |

### 1.5 boxer.test.ts — 拳王 (10 tests)

| # | 测试 | 验证点 |
|---|------|--------|
| 1 | `rock beats scissors` | 石头胜剪刀 |
| 2 | `scissors beats paper` | 剪刀胜布 |
| 3 | `paper beats rock` | 布胜石头 |
| 4 | `same move: both survive` | 平局双存 |
| 5 | `three players: winning move survives` | 3人淘汰 |
| 6 | `all three moves: all survive` | 三种手势全存 |
| 7 | `single player: auto survives` | 单人自动存活 |
| 8 | `getWinner > returns the only survivor` | 赢家判定 |
| 9 | `getWinner > throws on multiple` | 多存报错 |
| 10 | `getWinner > throws on empty` | 空报错 |

### 1.6 judge.test.ts — 牌型判断 (20 tests)

| # | 归类 | 测试 |
|---|------|------|
| 1 | 单牌 | `identifies single card` |
| 2 | 对子 | `identifies pair` |
| 3 | 无效 | `rejects two different cards` |
| 4 | Bike | `identifies bike (pair + any single)` |
| 5 | 三条 | `three same = triple, not bike` |
| 6 | 三条 | `identifies triple` |
| 7 | Root | `identifies root (two pairs + single)` |
| 8 | Root | `identifies two pairs (2+2) as Root` |
| 9 | 空 | `returns null for empty` |
| 10 | Root | `root: pairs not adjacent in input` |
| 11 | 无效 | `rejects 4 cards that are not two pairs` |
| 12 | 无效 | `rejects 6 cards` |
| 13 | Root | `full house (3+2) is valid Root` |
| 14 | 全部 | `correctly identifies all 5 hand types` |
| 15-20 | beats | 同型高点胜 / 同点高花胜 / 异型不胜 / Root比较大对 / Root比副对 / Bike比对子 |

---

## 二、服务端测试（jest）— 101 tests

**路径**: `packages/server/src/__tests__/`

### 2.1 game-machine.test.ts — 游戏逻辑 (71 tests)

#### initGame (8)
| # | 测试 |
|---|------|
| 1 | 2-player game deals 5 cards to each player |
| 2 | deck size = 52 - players * 5 for 2-player game |
| 3 | first game: smallest single card holder leads |
| 4 | leadPlayerId parameter overrides automatic lead detection |
| 5 | game is in Playing phase |
| 6 | initial passCount is 0 |
| 7 | isFirstTrick is true for a new game |
| 8 | 4-player game: deck = 104 - 4*5 = 84 |

#### handlePlay (14)
| # | 测试 |
|---|------|
| 9 | play a single card successfully |
| 10 | play a pair successfully |
| 11 | play a bike (pair + single) successfully |
| 12 | play a triple successfully |
| 13 | play a root (two pairs + single) successfully |
| 14 | invalid card combination (4 cards) is rejected |
| 15 | different hand type cannot beat current play |
| 16 | same hand type but lower rank cannot beat |
| 17 | player not found returns error |
| 18 | first trick must include smallest card, succeeds when included |
| 19 | first trick without smallest card is rejected |
| 20 | first trick check skipped when currentBestPlay exists |
| 21 | last card played + empty deck marks player as finished |
| 22 | last card played with non-empty deck does NOT mark finished |

#### 回合/游戏结束 (5)
| # | 测试 |
|---|------|
| 23 | round ends when passCount >= activePlayers - 1 |
| 24 | round end: winner draws cards first, then other participants |
| 25 | game over when deck empty and someone finished |
| 26 | game over when all players finished |
| 27 | beating resets passCount (get new chance) |

#### handlePass (6)
| # | 测试 |
|---|------|
| 28 | cannot pass when table is empty |
| 29 | passCount increments correctly |
| 30 | deck empty + bestPlayer cannot pass (returns error) |
| 31 | deck empty + no one finished → forcePlay |
| 32 | deck empty + someone finished → round over with gameOver |
| 33 | round ends when all other active players pass |

#### settleGame (2)
| # | 测试 |
|---|------|
| 34 | scores sorted descending by score |
| 35 | topTwo and bottomTwo are correctly identified |

#### getLargestSingle (2)
| # | 测试 |
|---|------|
| 36 | returns the highest-ranked card in hand |
| 37 | returns null for empty hand |

#### removeCardFromHand (3)
| # | 测试 |
|---|------|
| 38 | removes matching card from hand |
| 39 | returns original array if card not found |
| 40 | does not mutate original hand |

#### determineNextLead (1)
| # | 测试 |
|---|------|
| 41 | returns player who surrendered the largest card |

#### getBoxerScoreCards (3)
| # | 测试 |
|---|------|
| 42 | filters score cards (5, 10, K) from deck |
| 43 | returns empty array when no score cards in deck |
| 44 | collects score cards from unfinished players' hands |

#### getBoxerParticipants (1)
| # | 测试 |
|---|------|
| 45 | returns all player IDs |

#### executeSurrenderSwap (4)
| # | 测试 |
|---|------|
| 46 | <4 players: loser gives largest to winner, winner gives smallest back |
| 47 | <4 players: loser with empty hand does not crash |
| 48 | 4+ players: top2 and bottom2 swap correctly |
| 49 | nextLeadPlayerId = player who gave up the largest card |

#### executeSurrenderSwap — 交粮全流程 (8) *新增*
| # | 场景 | 测试 |
|---|------|------|
| 50 | 2位·一缴一收 | loser gives largest card, winner gives smallest back |
| 51 | 2位·一缴一收 | loser has empty hand — no crash, swap is no-op |
| 52 | 2位·一缴一收 | winner has only one card — gives it back |
| 53 | 3位·一缴一收 | 1 winner, 1 loser; middle player unaffected |
| 54 | 3位·一缴一收 | all same score — swap based on array order |
| 55 | 4位·二缴二收 | 4 players: top2 winners, bottom2 losers swap |
| 56 | 5位 | 5 players: still top2 vs bottom2 |
| 57 | 6位 | 6 players: swap count matches loser count |

#### verifyScoreTotal — 总分校验 (6) *新增*
| # | 测试 | 验证点 |
|---|------|--------|
| 58 | new game: 100pts in deck + hands | 新游戏总分=100 |
| 59 | after dealing: points split | 发牌后分布正确 |
| 60 | 4+ players: 200pts (2 decks) | 2副牌200分 |
| 61 | 5 players: 200pts | 5人200分 |
| 62 | 6 players: 200pts | 6人200分 |
| 63 | all score cards accounted for after one round | 一round后总分不变 |

#### Bug fixes — regression (5) *新增*
| # | Bug | 测试 | 验证点 |
|---|-----|------|--------|
| 64 | BUG-1 | forcePlay scores table before clearing | 5pt+10pt=15, table cleared |
| 65 | BUG-2 | post-boxer score in settlement | p1: 40+10=50 |
| 66 | BUG-2 | scores_updated carries final scores | 55+35 correct |
| 67 | BUG-3 | winner with 1 card: returns it | both keep >=1 card |
| 68 | BUG-3 | winner with 0 cards: undo swap | no crash, no card loss |

#### Boxer-to-settlement timing flow (3) *新增*
| # | 测试 | 验证点 |
|---|------|--------|
| 69 | post-boxer settlement sorted correctly | p3(80) > p1(60) > p2(50) |
| 70 | scores_updated carries final rankings | 55 > 45 |
| 71 | pendingSurrender uses post-boxer scores | winner=p2(70), loser=p1(40) |

**时序设计**: 拳王结束 → 2s → scores_updated (结算画面) → 3s → next_game_lead (返回房间)

### 2.2 game-simulation.test.ts — 多局模拟 (30 tests)

#### 2-player session (5 games × 4 checks = 4 tests)
| # | 测试 |
|---|------|
| 1 | all games complete successfully |
| 2 | 积分榜: settlement produces valid scores |
| 3 | 交粮: surrender swap determines next lead |
| 4 | 拳王: boxer score cards collected correctly |

#### 3-player session (同上结构 — 4 tests)
#### 4-player session (同上结构 — 4 tests)
#### 5-player session (同上结构 — 4 tests)
#### 6-player session (同上结构 — 4 tests)

#### 总分验证 (5 tests × 各玩家数)

| 玩家数 | 预期总分 | 公差 |
|--------|---------|------|
| 2 | ~100 | ±25% |
| 3 | ~100 | ±25% |
| 4 | ~200 | ±25% |
| 5 | ~200 | ±25% |
| 6 | ~200 | ±25% |

#### 连续5局完整链 (5 tests)
| # | 测试 |
|---|------|
| 1 | 2p: 连续5局，拳王→交粮→下一局 lead 正确传递 |
| 2 | 3p: 连续5局，拳王→交粮→下一局 lead 正确传递 |
| 3 | 4p: 连续5局，拳王→交粮→下一局 lead 正确传递 |
| 4 | 5p: 连续5局，拳王→交粮→下一局 lead 正确传递 |
| 5 | 6p: 连续5局，拳王→交粮→下一局 lead 正确传递 |

---

## 三、客户端单元测试（vitest）— 44 tests

**路径**: `packages/client/src/__tests__/`

### 3.1 CardSprite.test.ts — 卡牌组件 (10)

| # | 测试 |
|---|------|
| 1 | renders King correctly |
| 2 | applies suit-red class for hearts |
| 3 | applies suit-red class for diamonds |
| 4 | applies suit-black class for spades |
| 5 | applies suit-black class for clubs |
| 6 | applies selected class when selected |
| 7 | applies dimmed class when dimmed |
| 8 | emits select event on click |
| 9 | renders all 13 ranks correctly |
| 10 | renders all 4 suits correctly |

### 3.2 game-store.test.ts — Game Store (10)

| # | 测试 |
|---|------|
| 1 | selects a card |
| 2 | deselects a card when clicked again |
| 3 | selects multiple cards |
| 4 | selectedCount is computed correctly |
| 5 | adds cards to hand |
| 6 | removes cards from hand |
| 7 | removes multiple played cards |
| 8 | starts with default values |
| 9 | tracks scores |
| 10 | (clearSelection/bumpTrick) |

### 3.3 SurrenderOverlay.test.ts — 交粮逻辑 (11)

| # | 测试 |
|---|------|
| 1 | finds largest single card in hand |
| 2 | returns the only card when hand has one card |
| 3 | handles duplicate largest cards (2 decks) |
| 4 | selects card from surrendered list |
| 5 | returns smallest card from hand |
| 6 | returns smallest non-given card |
| 7 | returns the player who gave up the largest card |
| 8 | winnerIds are top 2 scores, loserIds are bottom 2 |
| 9 | <4 players: 1 winner, 1 loser |
| 10 | phase order: losers_give → winners_pick → winners_return → complete |
| 11 | removes one card when multiple identical cards exist |

### 3.4 useGame.test.ts — Game Composable (13)

| # | 测试 |
|---|------|
| 1 | initializes useGame composable |
| 2 | play emits play event |
| 3 | pass emits pass event |
| 4 | boxerMove emits boxer_move event |
| 5 | game_started sets store state |
| 6 | your_turn sets isMyTurn and hand |
| 7 | play_made updates table and removes cards |
| 8 | pass_made clears isMyTurn |
| 9 | draw_card updates hand and deckCount |
| 10 | round_result updates scores and clears table |
| 11 | game_over sets gameOver and rankings |
| 12 | boxer_start sets boxer state |
| 13 | boxer_reveal sets moves and phase |

---

## 四、E2E 冒烟测试（playwright）— 1 test

**路径**: `packages/client/e2e/full-game.spec.ts`

| # | 步骤 | 验证点 |
|---|------|--------|
| 1 | 创建房间 | 房间码6位显示 |
| 2 | 加入房间 | 双方可见彼此 |
| 3 | 双方准备 | 游戏开局 |
| 4 | 游戏界面 | 手牌区、桌面、出牌/过按钮可见 |
| 5 | 点击出牌 | 牌可选中，按钮状态正确 |

---

## 五、运行命令

```bash
# 全量测试
pnpm test                    # 引擎 + 服务端

# 分层测试
pnpm test:engine             # 引擎 (vitest)
pnpm test:server             # 服务端 (jest)
pnpm test:client             # 客户端 (vitest)

# E2E 冒烟
npx playwright test --config packages/client/playwright.config.ts

# 指定测试文件
npx pnpm --filter @79523/server test -- --testPathPattern="game-simulation"
```

## 六、已知局限

| 项目 | 说明 |
|------|------|
| E2E 未覆盖完整对局 | 多人实时游戏自动化难度高，仅做冒烟验证 |
| 交粮 UI 测试 | playwright E2E 未覆盖交粮环节交互 |
| 拳王 UI 测试 | BoxerOverlay E2E 未覆盖 |

## 七、已修复 Bug (v0.1)

| Bug | 根因 | 修复 |
|-----|------|------|
| forcePlay清表丢分 | `ws.ts:516` forcePlay 清 `tableCards` 不先计分 | 清表前 `bestPlayer.score += calculateScore(tableCards)` |
| 拳王得分未入结算 | `game_over` 在拳王前发射，不含拳王加分 | `finishBoxerFlow` 新增 `scores_updated` 事件 |
| 交粮少牌 | `executeSurrenderSwap` 中 `!winnerCard` 提前 return，loser 已失牌 | 归还 loser 的牌（undo give）再 return |
