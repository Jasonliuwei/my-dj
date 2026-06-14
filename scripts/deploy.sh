#!/usr/bin/env bash
# My DJ 一键部署脚本（在阿里云 ECS 上执行）
set -e

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "→ 未发现 .env，已从示例复制。请编辑 .env 后重新运行。"
  cp .env.example .env
  exit 1
fi

echo "→ 拉取/构建镜像并启动..."
docker compose pull netease-api || true
docker compose up -d --build

echo "→ 等待服务启动..."
sleep 5
docker compose ps

WEB_PORT=$(grep -E '^WEB_PORT=' .env | cut -d= -f2)
WEB_PORT=${WEB_PORT:-8080}
echo ""
echo "✅ 部署完成！访问： http://<你的服务器公网IP>:${WEB_PORT}"
echo "   健康检查： curl http://localhost:${WEB_PORT}/api/health"
