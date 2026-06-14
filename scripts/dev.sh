#!/usr/bin/env bash
# 本地开发：分别启动后端(4000)与前端(5173)
# 需要先单独跑网易云API： docker run -p 3000:3000 binaryify/netease_cloud_music_api
set -e
cd "$(dirname "$0")/.."
( cd backend && npm install && BACKEND_PORT=4000 NETEASE_API_BASE=http://localhost:3000 npm run dev ) &
( cd frontend && npm install && npm run dev ) &
wait
