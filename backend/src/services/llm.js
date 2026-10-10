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
  'You are a warm, charismatic radio DJ speaking natural, conversational English to one listener. ' +
  'The listener is named Jason, but only use his name in the opening greeting. Do not use the listener\'s name in song intros. ' +
  'Be vivid, warm and a little playful — like a close friend hosting a cozy late-night show. ' +
  'No lists, no stage directions, no emojis or brackets — output only the words to be spoken aloud.';

function stripListenerName(text) {
  return String(text || '')
    .trim()
    .replace(/^Jason[,\s.。:：—-]+/i, '')
    .trim();
}

// 2026 法定节假日(公历区间)——每年需更新。来源:国务院办公厅 2026 年放假安排
const HOLIDAY_RANGES = [
  ['2026-01-01', '2026-01-03', "New Year's Day"],
  ['2026-02-15', '2026-02-23', 'Spring Festival (Chinese New Year)'],
  ['2026-04-04', '2026-04-06', 'Qingming Festival'],
  ['2026-05-01', '2026-05-05', 'Labour Day'],
  ['2026-06-19', '2026-06-21', 'Dragon Boat Festival'],
  ['2026-09-25', '2026-09-27', 'Mid-Autumn Festival'],
  ['2026-10-01', '2026-10-07', 'National Day holiday'],
];
// 每年固定的小节日(公历),非法定但适合问候
const FIXED_FUN = {
  '02-14': "Valentine's Day",
  '12-24': 'Christmas Eve',
  '12-25': 'Christmas',
  '12-31': "New Year's Eve",
};

// 中国本地时间(Asia/Shanghai),不受容器时区(默认 UTC)影响
function timeContext() {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    weekday: 'long',
    hour: '2-digit',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map((x) => [x.type, x.value]));
  let hour = parseInt(p.hour, 10);
  if (hour === 24) hour = 0; // 午夜在某些环境会返回 24
  const weekday = p.weekday; // Monday ... Sunday
  const md = `${p.month}-${p.day}`;
  const ymd = `${p.year}-${p.month}-${p.day}`;
  const partOfDay = hour < 5 ? 'late night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const isWeekend = weekday === 'Saturday' || weekday === 'Sunday';
  let holiday = null;
  for (const [s, e, name] of HOLIDAY_RANGES) {
    if (ymd >= s && ymd <= e) { holiday = name; break; }
  }
  if (!holiday) holiday = FIXED_FUN[md] || null;
  return { hour, weekday, partOfDay, isWeekend, holiday };
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
  const heartCount = Math.min(Math.max(parseInt(track?.heartCount || 0, 10) || 0, 0), 5);
  const user =
    `Mood: ${s.djTone || 'warm and natural'}.\n` +
    (prevTrack ? `Just played: "${prevTrack.title}" by ${prevTrack.artist}.\n` : '') +
    `Up next: "${track.title}" by ${track.artist}.\n` +
    (heartCount > 0
      ? `Listener signal: he has marked this song with ${heartCount} heart${heartCount > 1 ? 's' : ''} out of 5. Treat it as a stronger personal favorite when shaping the intro, but do not sound like you are reading app telemetry.\n`
      : '') +
    `Write a short, engaging DJ intro in English (2-3 sentences) that flows naturally into this song. ` +
    `Do not use the listener's name in song intros. Do not start with "Jason". Just introduce the song naturally.`;
  try {
    return stripListenerName(await chat(user)) || templateScript({ scene, track, prevTrack });
  } catch (e) {
    console.error('[llm] djScript failed, fallback:', e.message);
    return templateScript({ scene, track, prevTrack });
  }
}

// 开场问候（私人电台开播）
export async function djGreeting({ count }) {
  const t = timeContext();
  const fallback =
    `Hey Jason, good ${t.partOfDay}, and welcome back to your own private radio. ` +
    (t.holiday
      ? `Happy ${t.holiday}! `
      : t.isWeekend
        ? `Hope you're having an easy ${t.weekday}. `
        : '') +
    `It's good to have you here again — I hope your day's been kind to you. ` +
    `I went digging through your favorites and pulled together ${count} songs just for this little session. ` +
    `So get comfortable, let everything else wait a moment, and let's ease into it together.`;
  if (!KEY) return fallback;
  const dayInfo = t.holiday
    ? `Today is ${t.weekday}, and in China it is ${t.holiday} — give a warm, fitting holiday greeting.`
    : t.isWeekend
      ? `It is ${t.weekday}, a weekend — keep it relaxed and unhurried.`
      : `It is ${t.weekday}, a weekday.`;
  const user =
    `It is ${t.partOfDay} in China (local time). ${dayInfo}\n` +
    `You're opening Jason's personal radio session with ${count} songs from his own favorites. ` +
    `Greet Jason warmly by name and acknowledge the time of day naturally${t.holiday ? ' and the occasion' : ''}, ` +
    `make a little friendly small talk or share a light, charming joke to set a cozy mood, ` +
    `then say you're about to begin. Keep it natural and unhurried — about 4 to 5 sentences.`;
  try {
    return (await chat(user, 320)) || fallback;
  } catch (e) {
    console.error('[llm] djGreeting failed, fallback:', e.message);
    return fallback;
  }
}
