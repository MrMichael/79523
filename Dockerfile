# 构建镜像：安装依赖 -> 构建前端 -> 运行时用 tsx 跑服务端（单端口托管前端 + API + socket.io）
# Node 22（better-sqlite3 13 的 Node 20 预编译包会段错误）；全量版自带编译工具链，免 apt。
FROM node:22

# BuildKit 会把宿主机的 HTTP(S)_PROXY 自动注入构建容器；此环境直连即可，
# 清掉以免 npm/pnpm 去连不存在的本地代理（如 127.0.0.1:7890）。
RUN unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy NO_PROXY no_proxy \
 && npm i -g pnpm@8.15.9

WORKDIR /app
COPY . .

RUN unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy NO_PROXY no_proxy \
 && pnpm install --frozen-lockfile \
 && pnpm build

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/app.db

EXPOSE 3000
CMD ["pnpm", "start"]
