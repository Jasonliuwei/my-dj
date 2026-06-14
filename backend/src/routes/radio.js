import { Router } from 'express';
import { nextTrack, feedback, SCENES } from '../services/recommender.js';
import { djScript } from '../services/llm.js';
import * as source from '../services/source.js';
import { logEvent } from '../db.js';

const router = Router();

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

// 反馈：like / skip / complete
router.post('/feedback', (req, res) => {
  const { track, action, scene } = req.body || {};
  if (!track || !action) return res.status(400).json({ error: 'bad_request' });
  feedback(track, action, scene);
  res.json({ ok: true });
});

export default router;
