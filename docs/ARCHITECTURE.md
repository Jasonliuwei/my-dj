# 架构说明

## 数据流

```
用户选场景
   │
   ▼
GET /api/radio/next?scene=focus
   │
   ├─ recommender.nextTrack(scene)
   │     ├─ source.search(场景关键词)         → 候选池（带 5min 缓存）
   │     ├─ 用 weights(偏好) + 随机探索 打分排序
   │     ├─ 去重最近播放
   │     └─ source.getUrl(id) 取可播放地址（取不到则顺延下一首）
   │
   ├─ llm.djScript({scene, track, prevTrack})  → AI 串场文案（Qwen，降级模板）
   └─ source.getLyric(id)                       → 歌词
        │
        ▼
前端：先播 TTS 串场（POST /api/tts，失败→浏览器语音）→ 再播歌曲
        │
   用户 like/skip / 自然听完
        ▼
POST /api/feedback → recommender.feedback() 调整 weights，越来越懂你
```

## 推荐算法（轻量、可解释）

- **权重表 `weights`**：`artist`（歌手）与 `keyword`（标题词）两类，各自累加分值。
- **反馈调权**：`like +2`，`complete +0.5`，`skip -1.5`；标题词按 0.3 系数同步。
- **打分** = 随机探索项 + Σ歌手权重 + Σ命中关键词权重×0.5。
- **多样性**：排序后从 Top6 里随机挑一首，避免每次都同一首；并排除最近 40 首。

足够 MVP 用，且每一步都可解释。后续可升级为基于音频特征 / 协同过滤 / 向量召回。

## 音源抽象（可插拔）

`services/source.js` 对外只暴露 `search / getUrl / getLyric`。
- `netease`：调用 `binaryify/netease_cloud_music_api`（独立容器）。
- `local`：读取 `data/music/tracks.json` + `/media` 静态托管你自传的 mp3。

要接 QQ 音乐 / Spotify / 自建曲库，只需新增一个 provider 实现这三个方法。

## AI 与降级策略（保证"永远能跑"）

| 能力 | 首选 | 无 Key/失败时 |
|------|------|--------------|
| 串场文案 | 通义千问 Qwen | 本地模板句式 |
| 语音播报 | Edge TTS（免费）| 浏览器 Web Speech API |
| 音源 | 网易云（+Cookie）| 自传音频 |

任意一项缺失，App 仍可完整体验，只是效果打折。

## 数据存储

SQLite（`better-sqlite3`），三张表：`events`(行为流) / `weights`(偏好) / `favorites`(收藏)。
通过 docker volume 持久化到宿主机 `backend/data/`。

切换 MySQL/RDS：替换 `db.js` 的实现（表结构不变），其余代码无需改动。

## 可扩展方向

- 多用户：加 `user_id` 维度 + 登录（events/weights/favorites 按用户隔离）。
- 更强推荐：引入歌曲音频特征或 embedding 召回。
- 主持人个性：把 DJ 人设、音色做成可选项；CosyVoice 自定义音色。
- 离线 PWA：加 manifest + service worker，做成可"装到手机桌面"的 App。
- 定时电台：用调度每天早上 8 点生成你的"晨间电台"歌单。
