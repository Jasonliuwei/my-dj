// 音源抽象层：对外暴露统一接口，内部按 MUSIC_SOURCE 切换 netease / local
import fs from 'node:fs';
import path from 'node:path';
import config from '../config.js';

// ---------- 工具 ----------
async function jget(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 MyDJ' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}
// 归一化 Cookie：用户可能只粘了 MUSIC_U 的值，自动补上前缀
const RAW_COOKIE = (config.neteaseCookie || '').trim();
const COOKIE = RAW_COOKIE
  ? (RAW_COOKIE.includes('MUSIC_U') ? RAW_COOKIE : `MUSIC_U=${RAW_COOKIE}`)
  : '';

function withCookie(url) {
  if (!COOKIE) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}cookie=${encodeURIComponent(COOKIE)}`;
}

// ====================================================================
// 网易云 provider
// ====================================================================
const NB = () => config.neteaseApiBase.replace(/\/$/, '');

function normalizeSong(s) {
  return {
    id: String(s.id),
    title: s.name,
    artist: (s.ar || s.artists || []).map((a) => a.name).join(' / '),
    album: (s.al || s.album || {}).name || '',
    cover: (s.al || s.album || {}).picUrl || '',
    duration: s.dt || s.duration || 0,
  };
}

const neteaseProvider = {
  async search(keyword, limit = 30) {
    const url = withCookie(`${NB()}/cloudsearch?keywords=${encodeURIComponent(keyword)}&limit=${limit}`);
    const data = await jget(url);
    const songs = data?.result?.songs || [];
    return songs.map(normalizeSong);
  },

  async getUrl(id) {
    // level=exhigh 尽量拿到可播放地址；无 cookie 时部分歌曲返回 null
    const url = withCookie(`${NB()}/song/url/v1?id=${id}&level=exhigh`);
    const data = await jget(url);
    const item = (data?.data || [])[0];
    return item?.url || null;
  },

  async getLyric(id) {
    try {
      const data = await jget(`${NB()}/lyric?id=${id}`);
      return data?.lrc?.lyric || '';
    } catch {
      return '';
    }
  },
};

// ====================================================================
// 本地自传音频 provider（兜底音源）
// 读取 backend/data/music/tracks.json，结构见 docs
// ====================================================================
const MUSIC_DIR = path.resolve(process.cwd(), 'data', 'music');
function loadLocalTracks() {
  const f = path.join(MUSIC_DIR, 'tracks.json');
  if (!fs.existsSync(f)) return [];
  try {
    return JSON.parse(fs.readFileSync(f, 'utf-8'));
  } catch {
    return [];
  }
}

const localProvider = {
  async search(keyword, limit = 30) {
    const kw = (keyword || '').toLowerCase();
    return loadLocalTracks()
      .filter(
        (t) =>
          !kw ||
          (t.title || '').toLowerCase().includes(kw) ||
          (t.artist || '').toLowerCase().includes(kw) ||
          (t.tags || []).join(' ').toLowerCase().includes(kw)
      )
      .slice(0, limit)
      .map((t) => ({
        id: String(t.id),
        title: t.title,
        artist: t.artist || '',
        album: t.album || '',
        cover: t.cover || '',
        duration: t.duration || 0,
      }));
  },
  async getUrl(id) {
    const t = loadLocalTracks().find((x) => String(x.id) === String(id));
    if (!t) return null;
    // file 字段为 data/music 下文件名，经 /media 静态路由对外
    return t.url || (t.file ? `/media/${encodeURIComponent(t.file)}` : null);
  },
  async getLyric(id) {
    const t = loadLocalTracks().find((x) => String(x.id) === String(id));
    return t?.lyric || '';
  },
};

// ====================================================================
// 网易云：拉取「我喜欢的音乐」并标注可播放性（需 netease 音源 + Cookie）
// ====================================================================
async function neteaseUserId() {
  const ts = Date.now();
  try {
    const a = await jget(withCookie(`${NB()}/user/account?timestamp=${ts}`));
    const id = a?.account?.id || a?.profile?.userId;
    if (id) return id;
  } catch {}
  // 备用：登录状态接口
  try {
    const s = await jget(withCookie(`${NB()}/login/status?timestamp=${ts}`));
    return s?.data?.profile?.userId || s?.profile?.userId || null;
  } catch {}
  return null;
}

export async function neteaseLikes(limit = 500) {
  if (config.musicSource !== 'netease')
    return { error: 'not_netease', message: '当前音源不是网易云，无法读取收藏' };
  if (!config.neteaseCookie)
    return { error: 'no_cookie', message: '服务器未配置网易云 Cookie' };

  const uid = await neteaseUserId();
  if (!uid) return { error: 'not_logged_in', message: 'Cookie 无效或已过期，请重新获取' };

  const likeData = await jget(withCookie(`${NB()}/likelist?uid=${uid}&timestamp=${Date.now()}`));
  let ids = (likeData?.ids || []).map(String);
  const total = ids.length;
  if (limit > 0) ids = ids.slice(0, limit);

  // 批量取歌曲详情
  const meta = {};
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200).join(',');
    try {
      const d = await jget(withCookie(`${NB()}/song/detail?ids=${batch}`));
      for (const s of d?.songs || []) meta[String(s.id)] = normalizeSong(s);
    } catch {}
  }
  // 批量判断可播放性
  const playable = {};
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100).join(',');
    try {
      const d = await jget(withCookie(`${NB()}/song/url/v1?id=${batch}&level=standard`));
      for (const it of d?.data || []) playable[String(it.id)] = !!it.url;
    } catch {}
  }

  const songs = ids.map((id) => ({
    ...(meta[id] || { id, title: '(未知歌曲)', artist: '', cover: '', album: '', duration: 0 }),
    playable: !!playable[id],
  }));
  return {
    uid,
    total,
    shown: songs.length,
    playableCount: songs.filter((s) => s.playable).length,
    songs,
  };
}

// ====================================================================
const provider = config.musicSource === 'local' ? localProvider : neteaseProvider;

export const search = (kw, limit) => provider.search(kw, limit);
export const getUrl = (id) => provider.getUrl(id);
export const getLyric = (id) => provider.getLyric(id);
export const sourceName = config.musicSource;
export { MUSIC_DIR };
