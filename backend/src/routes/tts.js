import { Router } from 'express';
import { synthesize } from '../services/tts.js';

const router = Router();

// 合成并返回音频；无内容时 204 让前端兜底
async function handle(rawText, res) {
  const maxChars = Math.max(300, parseInt(process.env.TTS_MAX_CHARS || '2000', 10));
  const text = (rawText || '').slice(0, maxChars);
  if (!text) return res.status(400).json({ error: 'no_text' });
  try {
    const out = await synthesize(text);
    if (!out) return res.status(204).end(); // 让前端用浏览器语音兜底
    res.set('Content-Type', out.contentType);
    res.set('Cache-Control', 'public, max-age=86400'); // 同一句可被缓存，省重复合成
    res.send(out.buffer);
  } catch (e) {
    console.error('[tts]', e.message);
    res.status(204).end();
  }
}

router.post('/tts', (req, res) => handle(req.body?.text, res));
// GET：供 <audio>/new Audio() 直接当媒体源加载（锁屏后台也能流式播放，blob 不行）
router.get('/tts', (req, res) => handle(req.query?.text, res));

export default router;
