# 测试覆盖报告

> 生成时间：2026-06-07 | 版本：v0.3
> 总计：**307 测试**（引擎 75 + 服务端 188 + 客户端 44）

---

## 一、引擎层测试（vitest）— 75 tests

**路径**: `packages/engine/src/__tests__/`

### deck.test.ts — 牌堆 (9)
### types.test.ts — 类型定义 (8)
### compare.test.ts — 比较 (13)
### score.test.ts — 计分 (11)
### boxer.test.ts — 拳王 (10)
### judge.test.ts — 牌型判断 (24)

| 新增 | 测试 |
|------|------|
| +1 | quads + single (4+1) → Root |
| +3 | triple beats bike / triple cannot beat lower / bike cannot beat triple |

---

## 二、服务端测试（jest）— 143 tests

**路径**: `packages/server/src/__tests__/`

### game-machine.test.ts — 游戏逻辑 (87 tests)

| 分类 | 测试数 | 内容 |
|------|--------|------|
| initGame | 8 | 发牌、lead、phase |
| handlePlay | 14 | 出牌、牌型、首墩规则 |
| handlePass | 7 | 过牌、forcePlay、决赛限制 |
| round/game-over | 5 | 回合结束、游戏结束 |
| settleGame | 2 | 排名 |
| getLargestSingle | 2 | |
| removeCardFromHand | 3 | |
| determineNextLead | 1 | |
| getBoxerScoreCards | 3 | |
| getBoxerParticipants | 1 | |
| executeSurrenderSwap | 4 | |
| **交粮全流程** | 8 | 2p/3p/4-6p 缴收场景 |
| **verifyScoreTotal** | 6 | 100/200分校验 |
| **Bug回归** | 5 | forcePlay丢分/拳王分/交粮丢牌 |
| **排位决胜分组** | 6 | 平局检测 |
| **端到端交粮** | 5 | 卡牌数完整性 |
| **无分牌场景** | 12 | a-e. 全场景平局检测 |
| **拳王后场景** | 16 | a-e. 全场景平局检测 |

### room.test.ts — 房间操作 (45 tests) *新增*

| 分类 | 测试数 | 覆盖 |
|------|--------|------|
| createRoom | 7 | 2-6人容量 + 唯一码 |
| joinRoom (容量) | 6 | 2-6人填满 |
| joinRoom (满员) | 5 | 2-6人拒绝第N+1 |
| joinRoom (重复) | 5 | 2-6人重复加入 |
| joinRoom (不存在) | 1 | null |
| leaveRoom | 6 | 2-6人正常离开 |
| leaveRoom (最后) | 5 | 2-6人最后离开→销毁 |
| getRoom/getAllRooms | 2 | |
| destroyRoom | 1 | |
| setRoomGame | 2 | |
| cleanupStaleRooms | 3 | 旧空/旧占/新空 |
| Player操作 | 4 | 创建/host/查找 |

### game-simulation.test.ts — 多局模拟 (30 tests)

2-6 人 × 5 局全模拟，含拳王+交粮+总分验证。

---

## 三、客户端测试（vitest）— 44 tests

| 文件 | 测试数 |
|------|--------|
| CardSprite.test.ts | 12 |
| game-store.test.ts | 13 |
| SurrenderOverlay.test.ts | 11 |
| useGame.test.ts | 8 |

---

## 四、运行命令

```bash
npx pnpm test                     # 引擎 + 服务端 + 前端
npx pnpm test:engine              # 引擎 (vitest)
npx pnpm test:server              # 服务端 (jest)
npx pnpm test:client              # 客户端 (vitest)
```

## 五、已修复 Bug (v0.1→v0.3)

| Bug | 根因 | 修复 |
|-----|------|------|
| 非先手发牌不显示 | game_started 未设 myHand | store.myHand = hand |
| 选牌残留 | 值相等 findIndex | ref相等 indexOf + 事件清理 |
| forcePlay清表丢分 | tableCards 未计分即清空 | 清前计分 |
| 拳王分未入结算 | game_over 在拳王前 | scores_updated 事件 |
| 交粮丢牌(filter) | filter 删全部重复卡 | removeCardFromHand |
| 交粮丢牌(cleanup) | cleanup 延迟覆盖 draw_card | 移除手牌同步 |
| 最后一张吞尾家 | finished 早于 activePlayers | 序调整 + bestPlayer计入 |
| 拳王 UI 不显示 | boxerPhase 未设 awaiting | boxer_start 设 phase |
| 2副牌重复卡选择 | selectCard 值相等 | indexOf 引用相等 |
| sorted 未声明崩溃 | 变量使用在声明前 | 调整声明顺序 |
| 总分异常 | tableCards 未清理(模拟) | 模拟端清理 |
| 拳王赢分显示错 | boxer_start 覆盖 scoreCard | boxerWinPoints 独立存储 |
| 4+1不识别为Root | identify 缺4+1模式 | 新增 quads+single |
| 无分牌跳排名决胜 | finishBoxerFlow 直接结算 | → resolveBoxerChampion |
| 排位决胜全员参与 | 未区分参与者/观摩者 | isSpectating 过滤 |
