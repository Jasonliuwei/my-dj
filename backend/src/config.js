import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 加载根目录 .env（容器内 env_file 注入；本地从仓库根读取）
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // 同时尝试 backend/.env

export const config = {
  port: parseInt(process.env.BACKEND_PORT || '4000', 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',

  musicSource: process.env.MUSIC_SOURCE || 'netease',
  neteaseApiBase: process.env.NETEASE_API_BASE || 'http://localhost:3000',
  neteaseCookie: process.env.NETEASE_COOKIE || '',

  llmKey: process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || '',
  llmModel: process.env.LLM_MODEL || 'deepseek-chat',
  llmBaseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',

  ttsProvider: process.env.TTS_PROVIDER || 'edge',
  edgeVoice: process.env.EDGE_TTS_VOICE || 'zh-CN-XiaoxiaoNeural',

  dbFile: process.env.DB_FILE || './data/mydj.db',
};

export default config;
