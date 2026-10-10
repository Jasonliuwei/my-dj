import { Router } from 'express';
import { nextTrack, feedback, SCENES } from '../services/recommender.js';
import { djScript, djGreeting } from '../services/llm.js';
import * as source from '../services/source.js';
import { getFavoriteHeartMap, logEvent, topHeartFavorites } from '../db.js';

const router = Router();

function weightedPick(items) {
  const total = items.reduce((sum, item) => sum + Math.max(1, item.heartCount || 1), 0);
  let cursor = Math.random() * total;
  for (const item of items) {
    cursor -= Math.max(1, item.heartCount || 1);
    if (cursor <= 0) return item;
  }
  return items[0];
}

async function playableHeartPicks(max = 2) {
  const pool = topHeartFavorites(30);
  const picks = [];
  const remaining = [...pool];
  while (remaining.length && picks.length < max) {
    const chosen = weightedPick(remaining);
    const idx = remaining.findIndex((t) => t.id === chosen.id);
    if (idx >= 0) remaining.splice(idx, 1);
    const url = await source.getUrl(chosen.id).catch(() => null);
    if (url) picks.push({ ...chosen, url, fromHearts: true });
  }
  return picks;
}

async function buildDailyPlaylist(n) {
  const heartTarget = n >= 6 ? 2 : 1;
  const heartPicks = await playableHeartPicks(heartTarget);
  const fill = await source.neteaseDailyPicks(n + heartPicks.length);
  const seen = new Set();
  const tracks = [];
  for (const t of [...heartPicks, ...fill]) {
    if (!t?.id || seen.has(String(t.id))) continue;
    seen.add(String(t.id));
    tracks.push(t);
    if (tracks.length >= n) break;
  }
  const heartMap = getFavoriteHeartMap(tracks.map((t) => t.id));
  return tracks.map((t) => ({
    ...t,
    heartCount: heartMap[String(t.id)] || t.heartCount || 0,
    fromHearts: Boolean(t.fromHearts || heartMap[String(t.id)]),
  }));
}

// 场景列表
router.get('/scenes', (req, res) => {
  res.json(
    Object.entries(SCENES).map(([key, v]) => ({
      key,
      label: v.label,
      emoji: v.emoji,
    }))
  );
});

// 电台下一首（含 AI 主持人串场文案）
router.get('/radio/next', async (req, res) => {
  try {
    const scene = req.query.scene || 'chill';
    const prevTrack = req.query.prevId
      ? { id: req.query.prevId, title: req.query.prevTitle, artist: req.query.prevArtist }
      : null;

    const track = await nextTrack(scene);
    if (!track) {
      return res.status(404).json({ error: 'no_playable_track', message: '没有找到可播放的歌曲，换个场景或配置网易云 Cookie 试试' });
    }

    const [djText, lyric] = await Promise.all([
      djScript({ scene, track, prevTrack }),
      source.getLyric(track.id).catch(() => ''),
    ]);

    logEvent({ trackId: track.id, title: track.title, artist: track.artist, action: 'play', scene });
    res.json({ track, djText, lyric });
  } catch (e) {
    console.error('[radio/next]', e);
    res.status(500).json({ error: 'server_error', message: e.message });
  }
});

// 今日歌单：从「我喜欢的音乐」抽 n 首可播放 + 开场问候
router.get('/radio/daily', async (req, res) => {
  try {
    const n = Math.min(Math.max(parseInt(req.query.n || '6', 10), 1), 12);
    const tracks = await buildDailyPlaylist(n);
    if (!tracks.length) {
      return res.status(404).json({
        error: 'no_tracks',
        message: '没能取到可播放的歌曲（请检查 Cookie 是否有效、收藏是否为空）',
      });
    }
    const greeting = await djGreeting({ count: tracks.length });
    res.json({ greeting, tracks });
  } catch (e) {
    console.error('[radio/daily]', e);
    res.status(500).json({ error: 'server_error', message: e.message });
  }
});

// 单曲串场（今日歌单逐首播放时调用）
router.get('/dj/intro', async (req, res) => {
  try {
    const track = {
      id: req.query.id,
      title: req.query.title,
      artist: req.query.artist,
      heartCount: parseInt(req.query.heartCount || '0', 10) || 0,
    };
    const prevTrack = req.query.prevTitle
      ? { title: req.query.prevTitle, artist: req.query.prevArtist }
      : null;
    const [djText, lyric] = await Promise.all([
      djScript({ scene: 'daily', track, prevTrack }),
      req.query.id ? source.getLyric(req.query.id).catch(() => '') : Promise.resolve(''),
    ]);
    if (req.query.id)
      logEvent({ trackId: req.query.id, title: track.title, artist: track.artist, action: 'play', scene: 'daily' });
    res.json({ djText, lyric });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 反馈：like / skip / complete
router.post('/feedback', (req, res) => {
  const { track, action, scene } = req.body || {};
  if (!track || !action) return res.status(400).json({ error: 'bad_request' });
  feedback(track, action, scene);
  res.json({ ok: true });
});

export default router;
