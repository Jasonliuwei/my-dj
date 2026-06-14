# 🎧 My DJ · 我的专属音乐电台

一个基于你个人喜好的 AI 电台 App：选一个**心情/场景**，系统按你的口味挑歌，并由 **AI 中文主持人**在歌曲之间串场播报——越听越懂你。

灵感来自「vibe coding DJ」类的 AI DJ 玩法（类似 Spotify AI DJ），技术栈贴合阿里云生态。

---

## ✨ 功能

- **场景电台**：专注 / 运动 / 放松 / 深夜 / 开车 / 元气 六大场景，一键开播
- **AI 主持人串场**：通义千问（Qwen）生成口语化串场词 + TTS 语音播报（中文）
- **个性化推荐**：根据你的「喜欢 / 跳过 / 听完」实时学习偏好，自动挑下一首
- **收藏夹 & 口味画像**：沉淀你喜欢的歌，可视化你偏爱的歌手与关键词
- **音源可插拔**：默认网易云非官方 API，随时切换为「自传音频」兜底
- **零 Key 也能跑**：没有 AI Key 时自动降级为本地模板文案 + 浏览器语音

---

## 🧱 技术栈

| 层 | 选型 | 说明 |
|----|------|------|
| 前端 | React 18 + Vite | 移动优先的播放器 UI |
| 后端 | Node.js 20 + Express | 电台 / 推荐 / AI / TTS |
| 音源 | 网易云非官方 API（可切自传音频） | `binaryify/netease_cloud_music_api` |
| 文案 | 阿里云百炼 通义千问 Qwen | OpenAI 兼容接口，无 Key 降级模板 |
| 语音 | 免费微软 Edge TTS（默认）/ CosyVoice（可选） | 无 Key 用浏览器语音兜底 |
| 数据库 | SQLite（默认，可切 MySQL/RDS） | 偏好、历史、收藏 |
| 部署 | Docker Compose | 一条命令起全套 |

> ⚠️ **版权与稳定性提醒**：网易云/QQ 等非官方接口**不稳定且有版权/合规风险**，很多歌的播放地址需要登录或 VIP。生产环境建议优先使用**自传音频**音源（你拥有版权的内容），或填入网易云登录 Cookie 解锁更多歌曲。详见部署文档。

---

## 🚀 快速开始（本地）

前置：已装 Node 20+ 和 Docker。

```bash
# 1) 配置环境变量
cp .env.example .env        # 可先不改，直接跑

# 2) 启动网易云音源（单独一个容器）
docker run -d -p 3000:3000 --name netease-api binaryify/netease_cloud_music_api

# 3) 起后端 + 前端（开发模式）
bash scripts/dev.sh
```

浏览器打开 http://localhost:5173 即可试听。

## 🐳 一键部署（生产 / 阿里云）

```bash
cp .env.example .env   # 编辑后填入你的配置
bash scripts/deploy.sh # 等价于 docker compose up -d --build
```

完整的阿里云 ECS 上线流程（含 GitHub 上传、安全组、域名、HTTPS）见：
**[docs/DEPLOY_ALIYUN.md](docs/DEPLOY_ALIYUN.md)**

系统架构与可扩展方向见：**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**

---

## 🔌 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查（含当前音源/TTS/Qwen 状态） |
| GET | `/api/scenes` | 场景列表 |
| GET | `/api/radio/next?scene=focus` | 下一首（含 AI 串场词与歌词） |
| POST | `/api/feedback` | 反馈 like/skip/complete（驱动推荐学习） |
| POST | `/api/tts` | 文本转语音（返回 mp3，或 204 让前端兜底） |
| GET | `/api/search?q=` | 搜索 |
| GET/POST/DELETE | `/api/favorites` | 收藏管理 |
| GET | `/api/stats` | 口味画像 |

---

## 📂 目录结构

```
my-dj/
├─ docker-compose.yml      # 编排：netease-api + backend + web
├─ .env.example            # 环境变量模板
├─ backend/                # Express 后端
│  └─ src/
│     ├─ services/         # source(音源) / llm(Qwen) / tts / recommender(推荐) / scenes
│     ├─ routes/           # radio / tts / library
│     ├─ db.js  config.js  index.js
├─ frontend/               # React + Vite
│  └─ src/                 # App / components / api / voice / styles
├─ scripts/                # deploy.sh / dev.sh
└─ docs/                   # 部署与架构文档
```
