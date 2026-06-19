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

const DJ_SYS =
  'You are a warm, charismatic radio DJ speaking natural, conversational English to one listener named Jason. ' +
  'Address him by name now and then so it feels personal and friendly. ' +
  'Be vivid, warm and a little playful — like a close friend hosting a cozy late-night show. ' +
  'No lists, no stage directions, no emojis or brackets — output only the words to be spoken aloud.';

function timeOfDay() {
  const h = new Date().getHours();
  return h < 5 ? 'late night' : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}

async function chat(user, maxTokens = 220) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: DJ_SYS },
        { role: 'user', content: user },
      ],
      temperature: 0.9,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`llm ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

export async function djScript({ scene, track, prevTrack }) {
  if (!KEY) return templateScript({ scene, track, prevTrack });
  const s = SCENES[scene] || {};
  const user =
    `Mood: ${s.djTone || 'warm and natural'}.\n` +
    (prevTrack ? `Just played: "${prevTrack.title}" by ${prevTrack.artist}.\n` : '') +
    `Up next: "${track.title}" by ${track.artist}.\n` +
    `Write a short, engaging DJ intro in English (2-3 sentences) that flows naturally into this song.`;
  try {
    return (await chat(user)) || templateScript({ scene, track, prevTrack });
  } catch (e) {
    console.error('[llm] djScript failed, fallback:', e.message);
    return templateScript({ scene, track, prevTrack });
  }
}

// 开场问候（私人电台开播）
export async function djGreeting({ count }) {
  const tod = timeOfDay();
  const fallback =
    `Hey Jason, good ${tod}, and welcome back to your own private radio. ` +
    `It's good to have you here again — I hope your day's been kind to you. ` +
    `I went digging through your favorites and pulled together ${count} songs just for this little session. ` +
    `So get comfortable, let everything else wait a moment, and let's ease into it together.`;
  if (!KEY) return fallback;
  const user =
    `It is ${tod}. You're opening Jason's personal radio session with ${count} songs from his own favorites. ` +
    `Greet Jason warmly by name, make a little friendly small talk or share a light, charming joke to set a cozy mood, ` +
    `then say you're about to begin. Keep it natural and unhurried — about 4 to 5 sentences.`;
  try {
    return (await chat(user, 320)) || fallback;
  } catch (e) {
    console.error('[llm] djGreeting failed, fallback:', e.message);
    return fallback;
  }
}
