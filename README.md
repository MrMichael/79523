# 烟三文四 — 在线卡牌对战游戏

在线扑克 · 争上游

## 快速开始

```bash
# 安装依赖
npx pnpm install

# 启动开发环境（前端 :5173 + 后端 :3000）
npx pnpm dev
```

浏览器打开 `http://localhost:5173`。

## 项目结构

```
packages/
  engine/   — 核心游戏逻辑（纯 TypeScript，无 UI 依赖）
  server/   — Express + Socket.IO 游戏服务端
  client/   — Vue 3 + Vite + Pinia 前端
```

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | Vue 3, Pinia, vue-router, socket.io-client |
| 构建 | Vite 5, vue-tsc |
| 后端 | Express 4, Socket.IO 4, tsx |
| 引擎 | TypeScript, vitest |
| 包管理 | pnpm workspace |

## 命令

```bash
npx pnpm dev           # 同时启动前后端
npx pnpm dev:server    # 仅服务端 :3000
npx pnpm dev:client    # 仅前端 :5173
npx pnpm test          # 引擎 + 服务端 + 前端测试
npx pnpm test:engine   # 引擎测试 (vitest)
npx pnpm test:server   # 服务端测试 (jest)
npx pnpm test:client   # 前端测试 (vitest)

# E2E 冒烟测试
npx playwright test --config packages/client/playwright.config.ts
```

## 游戏规则

### 牌型（由小到大）
- **单张** — 1 张
- **对子** — 2 张同点数
- **单车 (Bike)** — 1 对 + 1 单张（3 张）
- **三条 (Triple)** — 3 张同点数
- **根号 (Root)** — 2 对 + 1 单张（5 张），或 3 条 + 1 对（5 张）

### 特殊规则
- 三条可打单车（单向克制）：三条 A 可打单车 5，但单车不能打三条
- 首墩必须包含最小牌
- 最终轮（牌堆空）当前最佳出牌者不可过牌

### 计分
- 5 = 5 分，10 = 10 分，K = 10 分
- < 4 人用 1 副牌（52 张，总分 100）
- ≥ 4 人用 2 副牌（104 张，总分 200）

### 拳王争霸
游戏结束后，未打出的分牌通过石头剪刀布竞猜分配。全部分牌竞猜完毕后，若多人胜场相同，进入决胜局直到唯一冠军诞生。

### 交粮
每局结束后，低分玩家向高分玩家上缴最大单牌，高分玩家返还一张小牌。下一局由缴出最大牌的玩家先手。

## 局域网联机

Vite 已配置 `host: '0.0.0.0'`，启动后局域网设备可连接。

```bash
# 查看本机 IP
hostname -I

# 启动
npx pnpm dev
```

其他设备访问 `http://<本机IP>:5173`。

### 防火墙配置

如果局域网设备无法连接，放行端口：

```bash
# ufw
sudo ufw allow 5173/tcp
sudo ufw allow 3000/tcp

# 或 iptables
sudo iptables -A INPUT -p tcp --dport 5173 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 3000 -j ACCEPT
```

## 测试

| 层 | 工具 | 测试数 |
|---|------|--------|
| 引擎 | vitest | 85 |
| 服务端 | jest | 255 |
| 客户端 | vitest | 46 |
| E2E | playwright | 1 |
| **总计** | | **387** |
