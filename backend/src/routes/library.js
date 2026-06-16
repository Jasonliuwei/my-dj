import { Router } from 'express';
import * as source from '../services/source.js';
import { addFavorite, removeFavorite, listFavorites, stats } from '../db.js';

const router = Router();

router.get('/search', async (req, res) => {
  try {
    const r = await source.search(req.query.q || '', 30);
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/lyric', async (req, res) => {
  res.json({ lyric: await source.getLyric(req.query.id).catch(() => '') });
});

router.get('/favorites', (req, res) => res.json(listFavorites()));
router.post('/favorites', (req, res) => {
  const t = req.body?.track;
  if (!t?.id) return res.status(400).json({ error: 'bad_request' });
  addFavorite(t);
  res.json({ ok: true });
});
router.delete('/favorites/:id', (req, res) => {
  removeFavorite(req.params.id);
  res.json({ ok: true });
});

router.get('/stats', (req, res) => res.json(stats()));

// 网易云「我喜欢的音乐」
router.get('/netease/likes', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '500', 10);
    res.json(await source.neteaseLikes(limit));
  } catch (e) {
    res.status(500).json({ error: 'server_error', message: e.message });
  }
});

// 解析单曲播放地址（收藏列表里点播放用）
router.get('/track-url', async (req, res) => {
  try {
    const url = await source.getUrl(req.query.id);
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
