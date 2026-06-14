import { Router } from 'express';
import { synthesize } from '../services/tts.js';

const router = Router();

router.post('/tts', async (req, res) => {
  const text = (req.body?.text || '').slice(0, 300);
  if (!text) return res.status(400).json({ error: 'no_text' });
  try {
    const out = await synthesize(text);
    if (!out) return res.status(204).end(); // 让前端用浏览器语音兜底
    res.set('Content-Type', out.contentType);
    res.set('Cache-Control', 'no-store');
    res.send(out.buffer);
  } catch (e) {
    console.error('[tts]', e.message);
    res.status(204).end();
  }
});

export default router;
