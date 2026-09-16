# 部署与更新（Docker + SakuraFrp 内网穿透）

面向生产环境的部署手册。开发环境见 `README.md`。

## 架构

```
浏览器 ──https──> SakuraFrp 节点 ──tcp──> frpc 容器 ──http──> app 容器 (127.0.0.1:3000)
                                                                 ├─ 前端静态资源 (packages/client/dist)
                                                                 ├─ /api           (Express)
                                                                 └─ /socket.io     (Socket.IO, ws)
```

- **单端口同源**：`app` 用 3000 同时提供页面 + API + WebSocket。客户端用相对路径 `/api` 与 `io('/')`，所以只需要暴露一个端口。
- **穿透**：`sakura1` 跑 `natfrp.com/frpc`（`network_mode: host`），隧道在 SakuraFrp 面板配置为 **HTTP/HTTPS → 本地 `127.0.0.1:3000`**，开启**自动 HTTPS**。
- **持久化**：SQLite 落在宿主机 `./data/app.db`（bind mount，重建镜像不丢）。
- **密钥**：全部来自 `.env`（已被 `.gitignore` 忽略，不会入库）。

## 一次性准备

```bash
npx pnpm install
cp .env.example .env
```

编辑 `.env`：

| 变量 | 说明 |
|---|---|
| `JWT_SECRET` | 必填。`openssl rand -hex 32` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 管理员账号，**只在首次建库时创建** |
| `FRPC_TOKEN` | SakuraFrp 面板里的 frpc 访问密钥（形如 `xxxx:yyyy`） |

SakuraFrp 面板：新建隧道 → 类型 **HTTP/HTTPS** → 本地地址 `127.0.0.1`、本地端口 `3000` → 开启**自动 HTTPS**。

## 启动

```bash
docker compose up -d --build
docker compose ps                  # app 应为 healthy
docker compose logs -f sakura1     # 打印公网入口（域名:端口）
```

验证：

```bash
curl -s localhost:3000/health      # {"status":"ok"}
curl -sk -o /dev/null -w '%{http_code}\n' https://<入口>/     # 200
```

局域网也可直接访问 `http://<本机IP>:3000`。

## 一键脚本 `deploy.sh`

```bash
./deploy.sh              # 构建镜像 + 重启 app（隧道不动）+ 等待健康 + 重置房间 + 打印入口
./deploy.sh --test       # 先跑完整测试，再部署
./deploy.sh --no-build   # 只重启（改了 .env 时）
./deploy.sh --all        # 重建并重启全部（含 sakura1 隧道）
./deploy.sh -h           # 帮助
```

脚本会校验 `.env` 必填项，构建失败时**中止并退出非零**（不会用旧镜像“假成功”），成功后打印容器状态与公网入口。

最后一步会用管理员账号**清空所有在线房间**：房间是内存态的，残留的旧房间会把玩家卡在「进行中」的僵尸房里（加不了电脑、也开不了新局）。这一步失败**不会**影响部署结果，只会打印一行警告。

## 更新流程（改代码后）

```bash
cd <repo>

# 1) 本地验证
npx pnpm test                      # engine + server + client

# 2) 提交
git add -A && git commit -m "fix: ..."

# 3) 重建并重启（只重建 app；隧道容器不受影响）
docker compose up -d --build app

# 4) 验证
docker compose ps                  # app healthy
curl -s localhost:3000/health
```

- 只改了 `.env`（端口/密码等）→ 不需要 `--build`，直接 `docker compose up -d`。
- 前端/服务端代码改动才需要 `--build`。
- `./data` 是挂载卷，账号与战绩**不会**因重建丢失。

> 也可以用一键脚本：`./deploy.sh --test`（等价于跑测试 + 重建重启 + 等健康）。

## 运维速查

| 操作 | 命令 |
|---|---|
| 查看状态 | `docker compose ps` |
| 查看日志 | `docker compose logs -f app` / `docker compose logs -f sakura1` |
| 停服 | `docker compose down` |
| 全量更新 | `docker compose up -d --build` |
| 备份数据 | `docker compose down && cp data/app.db data/app.db.bak` |
| 回滚代码 | `git checkout <旧commit> && docker compose up -d --build` |

服务器重启后容器会因 `restart: always` 自动拉起；请确保 Docker 开机自启：`sudo systemctl enable docker`。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | 容器内监听端口（`docker-compose.yml` 固定 3000） |
| `DB_PATH` | `/data/app.db` | SQLite 路径（容器内），映射到宿主机 `./data` |
| `JWT_SECRET` | — | **必填**，token 签名密钥 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | — | 首次建库时的管理员 |
| `FRPC_TOKEN` | — | SakuraFrp frpc 访问密钥 |
| `CLIENT_DIST` | `packages/client/dist` | 可选，自定义前端产物目录 |
| `DISCONNECT_KICK_MS` | `180000` | 离线多久后移出房间（对局中不移出） |
| `TURN_TIMEOUT_MS` | `30000` | 回合计时（超时自动过牌） |

## 常见问题

**端口 3000 被占用**
本机 `npx pnpm dev` 的 dev server 也用 3000。部署时先 `docker compose down` 再起容器；要同时开发就改用别的端口并同步改隧道。

**`./data` 删不掉（权限不足）**
容器以 root 写入。用容器来删：
```bash
docker compose down
docker run --rm -v "$PWD/data:/data" node:22 sh -c 'rm -rf /data/*'
```

**修改管理员密码**
密码只在首次建库时按 `ADMIN_*` 创建，之后改 `.env` 无效。改 `.env` 后清库重启即可（会清空所有账号与战绩）：
```bash
docker compose down
docker run --rm -v "$PWD/data:/data" node:22 sh -c 'rm -rf /data/*'
docker compose up -d
```

**容器启动即退出 / 段错误（exit 139）**
`better-sqlite3@13` 的 Node 20 预编译包会段错误，因此镜像用 **Node 22**。不要降回 node:20。

**构建失败 / 层缓存不生效**
镜像基于全量 `node:22`（自带编译工具链，免 apt）。若 Docker 层缓存异常导致基础镜像没更新，用 `docker compose build --no-cache app` 或 `docker build --no-cache --network=host -t 79523-app .`。

**隧道没连上**
看 `docker compose logs sakura1`：确认 `FRPC_TOKEN` 正确、面板隧道本地端口是 `3000`、节点允许 WebSocket。入口地址会打印在日志里（`使用 >>域名:端口<< 连接你的隧道`）。

**改了监听端口**
需要三处一致：`docker-compose.yml` 的 `ports`、`PORT`（默认 3000）、SakuraFrp 隧道的本地端口。
