#!/usr/bin/env bash
# 一键部署 / 更新：校验 .env ->（可选）跑测试 -> 构建并重启容器 -> 等待健康 -> 输出状态
#
# 用法:
#   ./deploy.sh              构建镜像并重启 app（隧道容器不动）
#   ./deploy.sh --test       先跑完整测试再部署
#   ./deploy.sh --no-build   只重启容器（改了 .env 时用）
#   ./deploy.sh --all        重建并重启全部服务（含 sakura1 隧道）
#   ./deploy.sh -h           帮助
set -euo pipefail
cd "$(dirname "$0")"

usage() { sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

RUN_TESTS=0
REBUILD=1
SERVICE="app"
for arg in "$@"; do
  case "$arg" in
    --test)     RUN_TESTS=1 ;;
    --no-build) REBUILD=0 ;;
    --all)      SERVICE="" ;;
    -h|--help)  usage ;;
    *) echo "未知参数: $arg"; usage ;;
  esac
done

command -v docker >/dev/null 2>&1 || { echo "✗ 未找到 docker"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "✗ 未找到 docker compose"; exit 1; }

if [ ! -f .env ]; then
  echo "✗ 缺少 .env —— 先执行： cp .env.example .env 并填写值"
  exit 1
fi
for k in JWT_SECRET ADMIN_PASSWORD FRPC_TOKEN; do
  grep -qE "^${k}=.+" .env || { echo "✗ .env 缺少 ${k}"; exit 1; }
done

if [ "$RUN_TESTS" = 1 ]; then
  echo "==> 运行测试"
  npx pnpm test
fi

if [ -n "$SERVICE" ]; then
  echo "==> $([ "$REBUILD" = 1 ] && echo '构建并重启' || echo '重启') [$SERVICE]"
  if [ "$REBUILD" = 1 ]; then docker compose up -d --build "$SERVICE"; else docker compose up -d "$SERVICE"; fi
else
  echo "==> $([ "$REBUILD" = 1 ] && echo '构建并重启' || echo '重启') [全部]"
  if [ "$REBUILD" = 1 ]; then docker compose up -d --build; else docker compose up -d; fi
fi

echo "==> 等待健康检查…"
ok=0
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/health 2>/dev/null; then ok=1; break; fi
  sleep 2
done
if [ "$ok" != 1 ]; then
  echo "✗ 健康检查超时，查看日志： docker compose logs --tail=50 app"
  exit 1
fi

echo "==> 状态"
docker compose ps
echo "本机: http://127.0.0.1:3000/health -> $(curl -fsS http://127.0.0.1:3000/health)"
entry=$(docker compose logs sakura1 2>/dev/null | grep -aoE '使用 >>[^<]+<<' | tail -1 | sed -E 's/.*>>(.*)<<.*/\1/' || true)
[ -n "${entry:-}" ] && echo "公网: https://${entry}"
echo "✅ 完成"
