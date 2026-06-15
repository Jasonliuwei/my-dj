import express from 'express';
import cors from 'cors';
import config from './config.js';
import { sourceName, MUSIC_DIR } from './services/source.js';
import radio from './routes/radio.js';
import tts from './routes/tts.js';
import library from './routes/library.js';

const app = express();
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) =>
  res.json({
    ok: true,
    source: sourceName,
    tts: config.ttsProvider,
    llm: (process.env.LLM_API_KEY || config.dashscopeKey) ? 'on' : 'template',
    time: Date.now(),
  })
);

// 自传音频静态托管（local 音源用）
app.use('/media', express.static(MUSIC_DIR));

app.use('/api', radio);
app.use('/api', tts);
app.use('/api', library);

app.listen(config.port, () => {
  console.log(`\n🎧 My DJ backend running on :${config.port}`);
  console.log(`   音源=${sourceName}  TTS=${config.ttsProvider}  Qwen=${config.dashscopeKey ? 'on' : 'template(无Key)'}\n`);
});
