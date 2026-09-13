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
npx pnpm build         # 构建前端 -> packages/client/dist（并对服务端做类型检查）
npx pnpm start         # 生产启动：服务端单端口同时托管前端 + API + socket.io
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

## 生产部署（单端口 + 内网穿透）

> Docker / docker compose 的完整部署与更新流程见 **[DEPLOY.md](./DEPLOY.md)**。

生产模式下 **服务端同时托管前端页面 + `/api` + `/socket.io`**，所以只需要对外暴露**一个端口**（默认 3000），前后端天然同源（客户端用的是相对路径与 `io('/')`）。

### 本机运行

```bash
npx pnpm install
npx pnpm build                 # 前端 -> packages/client/dist（并做服务端类型检查）

cd packages/server
PORT=3000 \
DB_PATH=/srv/79523/app.db \
JWT_SECRET="$(openssl rand -hex 32)" \
ADMIN_USERNAME=admin ADMIN_PASSWORD='换成强密码' \
npx pnpm start                 # 即 tsx src/index.ts
```

打开 `http://<本机IP>:3000`。启动日志会打印 `[server] serving client from .../client/dist`。

> 服务端与引擎以 **TypeScript 源码**运行（用 `tsx`，已列为服务端 `dependencies`），所以 `npx pnpm install --prod` 后即可 `npx pnpm start`。`build` 只构建前端、并对服务端做类型检查。

### Docker / docker compose（推荐）

```bash
cp .env.example .env      # 填 JWT_SECRET / ADMIN_PASSWORD / FRPC_TOKEN
docker compose up -d --build
# 或一键： ./deploy.sh   （./deploy.sh --test 先跑测试；-h 看用法）
```

- **`app`**：构建镜像（Node 22，含 pnpm/vite），单端口 3000 托管前端 + API + socket.io；SQLite 落在 `./data/app.db`。
- **`sakura1`**：SakuraFrp 的 frpc（`network_mode: host`），按面板里的隧道（HTTP/HTTPS → 本地 `127.0.0.1:3000`，开启自动 HTTPS）自动连上；启动后日志会打印访问入口。

常用命令：

```bash
docker compose ps                 # 状态
docker compose logs -f sakura1    # 穿透日志（含入口域名/端口）
docker compose down               # 停服
```

> `.env` 已被 `.gitignore` 忽略。**首次启动**按 `.env` 的 `ADMIN_*` 创建管理员；之后改 `.env` 不会更新已有密码 —— 要改需先停服并清空 `./data`（数据属主是容器 root，可在容器里删：`docker run --rm -v "$PWD/data:/data" node:22 sh -c 'rm -rf /data/*'`）。

### 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | 监听端口（frp 本地端口填这个） |
| `DB_PATH` | `cwd/data/app.db` | SQLite 路径，**建议固定绝对路径**以免换目录丢库 |
| `JWT_SECRET` | `dev-secret-change-me` | **生产必须改**，否则 token 可被伪造 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | — | **首次启动时**若该用户不存在则创建管理员 |
| `CLIENT_DIST` | `packages/client/dist` | 可选，自定义前端产物目录 |
| `DISCONNECT_KICK_MS` | `180000` | 离线多久后移出房间（对局中不移出） |
| `TURN_TIMEOUT_MS` | `30000` | 回合计时（超时自动过牌） |

### 内网穿透（SakuraFrp / frp）+ 自动 HTTPS

> 参考文档：<https://doc.natfrp.com/frpc/manual.html#feature-auto-https>（面板字段以官方为准）

1. SakuraFrp 面板新建**隧道**：类型 **HTTP/HTTPS**，本地地址 `127.0.0.1`，本地端口 = 上面的 `PORT`（默认 `3000`）。
2. 开启**自动 HTTPS**（或选支持自动 HTTPS 的节点 + 自有域名 CNAME）。
3. 下载 frpc，用面板给的 token 运行（配置格式以文档为准，大致形如）：

```toml
serverAddr = "xx.natfrp.com"
serverPort = 7000
auth.token = "<你的 token>"

[[proxies]]
name = "79523"
type = "http"
localIP = "127.0.0.1"
localPort = 3000
subdomain = "yourname"     # -> yourname.natfrp.com
```

4. 访问 `https://yourname.natfrp.com`。页面为 https 后 socket.io 会自动用 `wss`（同源）。

注意事项：
- 确认隧道/节点**允许 WebSocket**（socket.io 优先用 ws；万一不行会退化为 polling，仍可玩但更慢）。
- 实时对战对延迟敏感，优先选离玩家近、带宽好的节点。
- 用 `pm2` / `systemd` 守护进程；只暴露隧道，不要直接对公网开 3000。
- 先设好 `ADMIN_USERNAME/ADMIN_PASSWORD` 再首次启动（管理员只在不存在时创建）。

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
| 服务端 | jest | 270 |
| 客户端 | vitest | 56 |
| E2E | playwright | 1 |
| **总计** | | **412** |
