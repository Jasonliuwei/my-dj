// AI 主持人文案：兼容任意 OpenAI 格式接口（DeepSeek / 通义千问 等）
// 通过环境变量配置；无 Key 时自动降级为本地模板，App 仍可正常使用
import { SCENES } from './scenes.js';

// 默认指向 DeepSeek；也可换成通义千问等任意 OpenAI 兼容服务
const BASE = (process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/$/, '');
const KEY = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || '';
const MODEL = process.env.LLM_MODEL || process.env.QWEN_MODEL || 'deepseek-chat';

function templateScript({ track }) {
  const lines = [
    `Here's ${track.artist} with "${track.title}".`,
    `Up next, "${track.title}" by ${track.artist}.`,
    `This one's "${track.title}", from ${track.artist}.`,
  ];
  return lines[Math.floor(Math.random() * lines.length)];
}

// 主持人人设：话少、有信息量、不抒情。串场越短越好——歌才是主角
const DJ_SYS =
  'You host a radio show for exactly one listener, in natural spoken English. ' +
  'You sound like a sharp, dry-witted friend with great taste, not a greeting card. Say less: every line must earn its place. ' +
  'Never use similes or poetic filler ("like a gentle breeze", "wraps around you"), never call music a journey, never recap the song that just played. ' +
  'Only state a fact about a song or artist if you are certain it is true; otherwise talk about the moment instead. ' +
  'Song and artist names may be Chinese: say them exactly as written, never translate or explain them. ' +
  'The listener is Jason; use his name only in the opening greeting, never in song intros. ' +
  'No lists, no stage directions, no emojis or brackets. Output only the words to be spoken aloud.';

// 模型偶尔会超长：硬性截到前 n 句，保证串场永远是"一两句"
function clampSentences(text, n) {
  const clean = String(text || '').trim().replace(/^["“]([\s\S]*)["”]$/, '$1');
  const parts = clean.split(/(?<=[.!?。！？])\s+/).filter(Boolean);
  return parts.slice(0, n).join(' ');
}

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

export async function djScript({ scene, track }) {
  if (!KEY) return templateScript({ track });
  const s = SCENES[scene] || {};
  const t = timeContext();
  const heartCount = Math.min(Math.max(parseInt(track?.heartCount || 0, 10) || 0, 0), 5);
  // 每次随机换一个切入角度，避免每首都是同一个套路
  const angles = [
    'one concrete, true detail about this song or artist (the year, who wrote it, where it comes from), only if you are certain of it',
    `why this one suits a ${t.weekday} ${t.partOfDay}`,
    'a quick, dry one-line observation or tease prompted by the title',
    'the bare minimum: hand over to the song with a little attitude',
  ];
  if (heartCount > 0)
    angles.push(`he has hearted this song ${heartCount} time${heartCount > 1 ? 's' : ''}; nod to it being a repeat favorite, casually, without sounding like app telemetry`);
  const angle = angles[Math.floor(Math.random() * angles.length)];
  const user =
    (s.djTone ? `Mood: ${s.djTone}.
` : '') +
    `Up next: "${track.title}" by ${track.artist}.
` +
    `Angle: ${angle}.
` +
    `Write the intro: ONE or TWO short sentences, 25 words at most, and name the song or the artist.`;
  try {
    return clampSentences(stripListenerName(await chat(user, 80)), 2) || templateScript({ track });
  } catch (e) {
    console.error('[llm] djScript failed, fallback:', e.message);
    return templateScript({ track });
  }
}

// 开场问候（私人电台开播）
export async function djGreeting({ count }) {
  const t = timeContext();
  const fallback =
    `Good ${t.partOfDay}, Jason. ` +
    (t.holiday ? `Happy ${t.holiday}. ` : '') +
    `${count} songs from your favorites, starting now.`;
  if (!KEY) return fallback;
  const dayInfo = t.holiday
    ? `Today is ${t.weekday}, and in China it is ${t.holiday} — give a warm, fitting holiday greeting.`
    : t.isWeekend
      ? `It is ${t.weekday}, a weekend — keep it relaxed and unhurried.`
      : `It is ${t.weekday}, a weekday.`;
  const user =
    `It is ${t.partOfDay} in China (local time). ${dayInfo}
` +
    `Open Jason's personal radio session: ${count} songs from his own favorites. ` +
    `Greet him by name, say one specific, human thing about this ${t.weekday} ${t.partOfDay}${t.holiday ? ' or the occasion' : ''}, ` +
    `and get to the music. TWO sentences, 30 words at most. No small talk, no coffee jokes.`;
  try {
    return clampSentences(await chat(user, 100), 3) || fallback;
  } catch (e) {
    console.error('[llm] djGreeting failed, fallback:', e.message);
    return fallback;
  }
}
