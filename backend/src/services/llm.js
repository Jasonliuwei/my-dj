// AI 主持人文案：兼容任意 OpenAI 格式接口（DeepSeek / 通义千问 等）
// 通过环境变量配置；无 Key 时自动降级为本地模板，App 仍可正常使用
import { SCENES } from './scenes.js';

// 默认指向 DeepSeek；也可换成通义千问等任意 OpenAI 兼容服务
const BASE = (process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
const KEY = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || '';
const MODEL = process.env.LLM_MODEL || process.env.QWEN_MODEL || 'deepseek-chat';

function templateScript({ scene, track, prevTrack }) {
  const openers = [
    `You're tuned in to your own private radio, and the next few minutes belong to you.`,
    `Welcome back — let's keep this going and let the music do the talking.`,
    `Settle in, take a breath; I've got something good lined up for you.`,
  ];
  const o = openers[Math.floor(Math.random() * openers.length)];
  const prev = prevTrack ? `Hope "${prevTrack.title}" landed just right. ` : '';
  return `${o} ${prev}Up next, here's "${track.title}" by ${track.artist} — this one's for you.`;
}

export async function djScript({ scene, track, prevTrack }) {
  if (!KEY) {
    return templateScript({ scene, track, prevTrack });
  }
  const s = SCENES[scene] || {};
  const sys =
    'You are a warm, charismatic radio DJ speaking natural, conversational English. ' +
    'Speak 2 to 3 short sentences that set the mood and lead smoothly into the next track. ' +
    'Be vivid, personal and a little poetic, like you are talking to one listener late at night. ' +
    'No lists, no stage directions, no emojis or brackets — output only the words to be spoken aloud.';
  const user =
    `Scene: ${s.label || scene} (mood: ${s.djTone || 'warm and natural'}).\n` +
    (prevTrack ? `Just played: "${prevTrack.title}" by ${prevTrack.artist}.\n` : '') +
    `Up next: "${track.title}" by ${track.artist}.\n` +
    `Write a short, engaging DJ intro in English (2-3 sentences) that flows naturally into this song.`;

  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: 0.9,
        max_tokens: 220,
      }),
    });
    if (!res.ok) throw new Error(`llm ${res.status}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text || templateScript({ scene, track, prevTrack });
  } catch (e) {
    console.error('[llm] request failed, fallback to template:', e.message);
    return templateScript({ scene, track, prevTrack });
  }
}
