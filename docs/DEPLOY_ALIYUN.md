# 阿里云 ECS 上线全流程（图文步骤）

本文带你把 My DJ 从代码部署到公网可访问。全程约 30–60 分钟。

> 你需要准备：① 一台阿里云 ECS（Linux）② GitHub 账号 ③（可选）一个域名 ④（可选）通义千问 API Key。

---

## 第 0 步：总览

部署后会有 3 个容器：

```
[浏览器] → :8080 → web(nginx)  →  backend(:4000)  →  netease-api(:3000)
                       静态页+反代      电台/AI/推荐        音源
```

只对外开放一个端口（默认 8080，配域名后用 80/443）。

---

## 第 1 步：把代码传到 GitHub

在你**本地电脑**的项目目录里执行：

```bash
git init
git add .
git commit -m "init: My DJ"

# 在 GitHub 上先新建一个空仓库（比如 my-dj），然后：
git remote add origin git@github.com:<你的用户名>/my-dj.git
git branch -M main
git push -u origin main
```

> ✅ `.gitignore` 已配置好，不会上传 `.env`、`node_modules`、数据库文件等敏感/冗余内容。**永远不要把 `.env` 提交到 GitHub。**

---

## 第 2 步：买 / 配置 ECS

1. 阿里云控制台 → 云服务器 ECS → 实例。推荐配置：**2 核 4G、Ubuntu 22.04**（1 核 2G 也能跑，但构建较慢）。
2. **安全组**：添加入方向规则，放行端口 **8080**（TCP）。配了域名+HTTPS 后再放行 **80、443**。
3. 记下实例的**公网 IP**。

---

## 第 3 步：登录服务器，装 Docker

SSH 登录后（`ssh root@<公网IP>`）：

```bash
# 安装 Docker（官方一键脚本）
curl -fsSL https://get.docker.com | bash
systemctl enable --now docker

# 验证
docker --version && docker compose version
```

> 国内拉镜像慢的话，可在 `/etc/docker/daemon.json` 配置镜像加速器（阿里云容器镜像服务里有你的专属加速地址），然后 `systemctl restart docker`。

---

## 第 4 步：拉代码并配置

```bash
cd /opt
git clone https://github.com/<你的用户名>/my-dj.git
cd my-dj

# 生成配置
cp .env.example .env
vim .env
```

`.env` 关键项：

```ini
WEB_PORT=8080
MUSIC_SOURCE=netease
NETEASE_API_BASE=http://netease-api:3000
NETEASE_COOKIE=         # 强烈建议填，见第 6 步
DASHSCOPE_API_KEY=      # 通义千问 Key，见第 5 步；不填则用模板文案
QWEN_MODEL=qwen-plus
TTS_PROVIDER=edge       # 免费，无需 Key
CORS_ORIGIN=*           # 配好域名后改成 https://你的域名
```

---

## 第 5 步：（可选但推荐）开通通义千问，让主持人更生动

1. 打开阿里云**百炼**控制台 → 开通服务。
2. 进入 **API-KEY 管理** → 创建 API Key（形如 `sk-xxxx`）。
3. 填入 `.env` 的 `DASHSCOPE_API_KEY`。

不填也能跑——主持人会用本地模板说话，只是没那么"活"。

---

## 第 6 步：（强烈推荐）配置网易云 Cookie，解锁更多歌曲

不填 Cookie 时，很多歌因版权返回不了播放地址，导致"挑不到可播放的歌"。

获取方法：
1. 电脑浏览器登录 https://music.163.com 。
2. F12 → Application/应用 → Cookies → 复制 `MUSIC_U=...` 这一段（整条 cookie 字符串也行）。
3. 填入 `.env` 的 `NETEASE_COOKIE`。

> Cookie 会过期，失效后重新获取即可。**请只用你自己的账号，遵守平台条款；生产/商用强烈建议改用自传音频音源（见下）。**

### 备选：自传音频音源（最稳、无版权风险）

```bash
# 1) 把你拥有版权的 mp3 放到 backend/data/music/
# 2) 复制示例清单并按格式填写
cp backend/data/music/tracks.json.example backend/data/music/tracks.json
vim backend/data/music/tracks.json
# 3) 把 .env 改为 MUSIC_SOURCE=local
```

---

## 第 7 步：一键启动

```bash
bash scripts/deploy.sh
# 或： docker compose up -d --build
```

验证：

```bash
curl http://localhost:8080/api/health
# 期望返回 {"ok":true,"source":"netease","tts":"edge",...}
```

浏览器访问：`http://<公网IP>:8080` 🎉

---

## 第 8 步：（可选）绑定域名 + HTTPS

1. 域名解析：在域名服务商把 `dj.example.com` 的 A 记录指向 ECS 公网 IP。
   > 国内服务器域名需在阿里云完成 **ICP 备案**后才能用 80/443 对外访问。
2. 最简方案——用 Caddy 自动签发证书。在服务器装 Caddy 后，`/etc/caddy/Caddyfile`：

   ```
   dj.example.com {
       reverse_proxy localhost:8080
   }
   ```

   ```bash
   systemctl reload caddy
   ```
   Caddy 会自动申请并续期 Let's Encrypt 证书。
3. 把 `.env` 的 `CORS_ORIGIN` 改成 `https://dj.example.com`，重启：`docker compose up -d`。
4. 安全组放行 80、443。

---

## 日常运维

```bash
docker compose ps            # 查看状态
docker compose logs -f backend   # 看后端日志
docker compose restart backend   # 重启某服务

# 更新代码后重新部署
git pull && docker compose up -d --build
```

数据（偏好/收藏/历史）存在 `backend/data/mydj.db`，已通过 volume 持久化，重建容器不丢。**建议定期备份这个文件。**

---

## 常见问题

**Q：一直提示"没有找到可播放的歌曲"？**
A：多半是没配网易云 Cookie，免费可播放曲库很小。填 `NETEASE_COOKIE` 或改用 `MUSIC_SOURCE=local`。

**Q：主持人不说话 / 没声音？**
A：浏览器需要先有一次点击（选场景那一下）才允许自动播放。若后端 TTS 失败会自动用浏览器语音兜底；个别浏览器无中文语音时可能静音，建议配 `TTS_PROVIDER=edge`（默认）。

**Q：想换成 MySQL / 阿里云 RDS？**
A：当前用 SQLite（零运维）。如需 MySQL，把 `backend/src/db.js` 换成 mysql2 实现即可，表结构在该文件里。需要的话可以让我改。

**Q：netease-api 镜像拉不下来？**
A：配置阿里云镜像加速器，或在容器镜像服务里同步该镜像后改 compose 的 image 地址。
