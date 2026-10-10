# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

My DJ — 场景音乐电台：选一个心情/场景，后端按学到的口味挑歌，AI 中文主持人在歌曲间串场。
面向用户的功能说明、API 表、部署流程见 `README.md`、`docs/ARCHITECTURE.md`、`docs/DEPLOY_ALIYUN.md`。

## 运行

本地开发（前置：Node 20+、Docker）：

```bash
docker run -d -p 3000:3000 --name netease-api binaryify/netease_cloud_music_api  # 音源容器
cp .env.example .env        # 可先不改直接跑（无 Key 自动降级）
bash scripts/dev.sh         # 装依赖并同时起 backend(4000) + frontend(5173)
```

生产：`bash scripts/deploy.sh`（= `docker compose up -d --build`，编排 netease-api + backend + web）。

没有测试框架，也没有 lint 配置——"验证"指把 app 跑起来看行为，不是 `npm test`。

## 架构（big picture）

三层，由 `docker-compose.yml` 串起来：

```
netease-api (网易云非官方API, Docker镜像)
   └─> backend (Express, :4000)  ──>  web (nginx 托管前端静态页 + 反代 /api, :8080)
```

后端核心逻辑都在 `backend/src/services/`，routes 只是薄封装：

- **`source.js`** — 音源抽象层。按 `MUSIC_SOURCE`（`netease` / `local`）选 provider，对外统一暴露
  `search / getUrl / getLyric`。所有歌曲经 `normalizeSong` 归一化成同一形状，**上层（推荐/路由）不感知具体音源**——这是音源可插拔的关键。`netease_*` 系列函数额外支持用登录 Cookie 拉"我喜欢"和每日推荐。
- **`recommender.js`** — 推荐闭环的核心。`nextTrack(scene)` 先按场景关键词从 `source.search` 建候选池
  （5 分钟缓存），用 `db` 里学到的 `weights`（artist / keyword 权重）打分，叠加随机探索项，排除最近播过的，从前列随机取一首。权重由 `POST /api/feedback`（like/skip/complete）经 `bumpWeight` 更新——**这就是"越听越懂你"的机制**。
- **`llm.js`** — 生成中文串场词。走 OpenAI 兼容接口，**默认 DeepSeek**（见下方"配置"），无 Key 时降级为本地模板文案。
- **`tts.js`** — 文本转语音。默认免费 Edge TTS；可切 ElevenLabs；`off` 时返回 204 让前端用浏览器语音兜底。
- **`scenes.js`** — 六大场景定义与每个场景的关键词池（喂给 recommender 建候选）。

数据层 `db.js` 用 SQLite（`better-sqlite3`，文件在 `backend/data/mydj.db`），三张表：
`events`（播放/反馈日志）、`weights`（学到的偏好权重）、`favorites`（收藏）。

前端 `frontend/src/`：`App.jsx` 编排；`components/` 里 `SceneGrid`（选场景）、`Player`（播放器+串场）、
`DailyRadio`、`NeteaseLikes`、`Panel`；`api.js` 调后端；`voice.js` 是浏览器语音兜底。

## 配置（`.env`，由 `backend/src/config.js` 读取）

- LLM provider 现在**默认 DeepSeek**（`LLM_API_KEY` > `DEEPSEEK_API_KEY`，base `api.deepseek.com/v1`，
  model `deepseek-chat`）。README 里写的"通义千问 Qwen"是旧文案——以 `config.js` / `.env.example` 为准。
- 所有外部能力（LLM、TTS、网易云）**无 Key/无 Cookie 都能跑**，自动降级。改默认前先确认降级路径仍通。
- `config.js` 先读仓库根 `.env`，再读 `backend/.env`——容器内由 compose 的 `env_file` 注入。

## 注意

- 网易云等非官方接口**不稳定、有版权/合规风险**，很多歌的播放地址需登录或 VIP。本地测试之外，优先
  `MUSIC_SOURCE=local`（自传音频）或填 `NETEASE_COOKIE`。
- 发布上线走用户的 `deploy-b2dream` skill，不要自行拼 git/部署命令。
