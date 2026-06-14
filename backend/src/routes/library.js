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

export default router;
