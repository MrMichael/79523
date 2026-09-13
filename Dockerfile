# 构建镜像：安装依赖 -> 构建前端 -> 运行时用 tsx 跑服务端（单端口托管前端 + API + socket.io）
# Node 22（better-sqlite3 13 的 Node 20 预编译包会段错误）；全量版自带编译工具链，免 apt。
FROM node:22

RUN corepack enable && corepack prepare pnpm@8.15.9 --activate

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm build

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/app.db

EXPOSE 3000
CMD ["pnpm", "start"]
