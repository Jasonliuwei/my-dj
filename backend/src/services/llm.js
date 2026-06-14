// AI 主持人文案：阿里云百炼 通义千问（OpenAI 兼容接口）
// 无 Key 时自动降级为本地模板，App 仍可正常使用
import config from '../config.js';
import { SCENES } from './scenes.js';

const DASHSCOPE_URL =
  'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

function templateScript({ scene, track, prevTrack }) {
  const s = SCENES[scene] || {};
  const openers = [
    `这里是你的专属电台，${s.label || '此刻'}时间。`,
    `欢迎回来，让我们继续。`,
    `音乐不停，陪你到现在。`,
  ];
  const o = openers[Math.floor(Math.random() * openers.length)];
  const prev = prevTrack ? `刚刚那首《${prevTrack.title}》还不错吧。` : '';
  return `${o}${prev}接下来这首，《${track.title}》，${track.artist}。送给此刻的你。`;
}

export async function djScript({ scene, track, prevTrack }) {
  if (!config.dashscopeKey) {
    return templateScript({ scene, track, prevTrack });
  }
  const s = SCENES[scene] || {};
  const sys =
    '你是一个温暖、有个性的中文音乐电台 DJ。每次只说 1~2 句话，口语化、自然、像在跟一个人聊天，' +
    '不要用书面语，不要列举，不要加任何括号或表情符号，直接输出要播报的话。';
  const user =
    `当前场景：${s.label || scene}，语气要求：${s.djTone || '自然亲切'}。\n` +
    (prevTrack ? `上一首刚播完：《${prevTrack.title}》- ${prevTrack.artist}。\n` : '') +
    `马上要播放：《${track.title}》- ${track.artist}。\n` +
    `请用一句简短的串场词自然地引出这首歌。`;

  try {
    const res = await fetch(DASHSCOPE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.dashscopeKey}`,
      },
      body: JSON.stringify({
        model: config.qwenModel,
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: user },
        ],
        temperature: 0.9,
        max_tokens: 120,
      }),
    });
    if (!res.ok) throw new Error(`dashscope ${res.status}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text || templateScript({ scene, track, prevTrack });
  } catch (e) {
    console.error('[llm] qwen failed, fallback to template:', e.message);
    return templateScript({ scene, track, prevTrack });
  }
}
