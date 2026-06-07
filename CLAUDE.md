# 79523

pnpm monorepo 卡牌对战游戏。

## 项目需求

@docs/superpowers/specs/2026-06-05-79523-design.md

## 项目结构

```
packages/
  engine/   — 核心游戏逻辑（纯 TypeScript，无 UI 依赖）
  server/   — Express + Socket.IO 游戏服务端
  client/   — Vue 3 + Vite + Pinia 前端
```

## 命令

```bash
# 开发（同时启动前后端）
npx pnpm dev

# 单独启动
npx pnpm dev:server   # 服务端 :3000
npx pnpm dev:client   # 前端 :5173

# 测试
npx pnpm test          # engine + server
npx pnpm test:engine   # 仅引擎（vitest）
npx pnpm test:server   # 仅服务端（jest）
```

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | Vue 3, Pinia, vue-router, socket.io-client |
| 构建 | Vite 5, vue-tsc |
| 后端 | Express 4, Socket.IO 4, tsx |
| 引擎 | TypeScript, vitest |
| 包管理 | pnpm workspace |
