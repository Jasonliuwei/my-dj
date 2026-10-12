import { Router } from 'express';
import { nextTrack, feedback, SCENES } from '../services/recommender.js';
import { djScript, djGreeting } from '../services/llm.js';
import * as source from '../services/source.js';
import { getFavoriteHeartMap, logEvent, recentTrackIds, topHeartFavorites } from '../db.js';

const router = Router();

// 打过心的歌更容易被选中，但权重压得很平（1 心 1.5、5 心 3.5），不让心数最多的那几首每次都中
function weightedPick(items) {
  const w = (item) => 1 + 0.5 * Math.max(0, item.heartCount || 0);
  const total = items.reduce((sum, item) => sum + w(item), 0);
  let cursor = Math.random() * total;
  for (const item of items) {
    cursor -= w(item);
    if (cursor <= 0) return item;
  }
  return items[0];
}

const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

async function playableHeartPicks(max, recent) {
  if (max <= 0) return [];
  const all = topHeartFavorites(200);
  // 最近几次电台放过的先不放；心标的歌本来就少、全被排除时再放开
  const fresh = all.filter((t) => !recent.has(String(t.id)));
  const remaining = fresh.length ? fresh : [...all];
  const picks = [];
  let tries = 0;
  while (remaining.length && picks.length < max && tries++ < 8) {
    const chosen = weightedPick(remaining);
    const idx = remaining.findIndex((t) => t.id === chosen.id);
    if (idx >= 0) remaining.splice(idx, 1);
    const url = await source.getUrl(chosen.id).catch(() => null);
    if (url) picks.push({ ...chosen, url, fromHearts: true });
  }
  return picks;
}

// 今日歌单：主体从全部收藏里随机抽；打过心的歌只是"偶尔出现、几率更高"——
// 每张歌单 0~2 首（平均 1 首），位置随机且不放第一首，避免每次一开场都是那几首老面孔
async function buildDailyPlaylist(n) {
  const recent = new Set(recentTrackIds(30).map(String));
  const heartTarget = n >= 6 ? pickOne([0, 1, 1, 2]) : pickOne([0, 1]);
  const heartPicks = await playableHeartPicks(heartTarget, recent);
  const heartIds = new Set(heartPicks.map((t) => String(t.id)));

  const candidates = (await source.neteaseDailyPicks(n + 8)).filter((t) => t?.id && !heartIds.has(String(t.id)));
  const freshFill = candidates.filter((t) => !recent.has(String(t.id)));
  const fillPool = freshFill.length >= n - heartPicks.length ? freshFill : candidates;
  const tracks = fillPool.slice(0, n - heartPicks.length);

  for (const h of heartPicks) {
    const at = tracks.length ? 1 + Math.floor(Math.random() * tracks.length) : 0; // 1..末尾，不占第一首
    tracks.splice(at, 0, h);
  }

  const heartMap = getFavoriteHeartMap(tracks.map((t) => t.id));
  return tracks.slice(0, n).map((t) => ({
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
    // talk=0：这首不串场，直接进歌（前端隔首才让主持人开口），仍照常记播放日志
    const talk = req.query.talk !== '0';
    const [djText, lyric] = await Promise.all([
      talk ? djScript({ scene: 'daily', track, prevTrack }) : Promise.resolve(''),
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
