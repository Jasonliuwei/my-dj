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
function withCookie(url) {
  if (!config.neteaseCookie) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}cookie=${encodeURIComponent(config.neteaseCookie)}`;
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
const provider = config.musicSource === 'local' ? localProvider : neteaseProvider;

export const search = (kw, limit) => provider.search(kw, limit);
export const getUrl = (id) => provider.getUrl(id);
export const getLyric = (id) => provider.getLyric(id);
export const sourceName = config.musicSource;
export { MUSIC_DIR };
