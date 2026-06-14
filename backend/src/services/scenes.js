// 场景/心情电台定义：每个场景 -> 检索关键词池 + 主持人语气
export const SCENES = {
  focus: {
    label: '专注工作',
    emoji: '🎯',
    keywords: ['post rock 专注', '轻音乐 工作', 'lofi 学习', '纯音乐 钢琴', 'ambient 专注'],
    djTone: '沉稳、轻声、不打扰，像深夜电台',
  },
  workout: {
    label: '运动燃脂',
    emoji: '🔥',
    keywords: ['运动 电音', 'EDM 健身', '跑步 节奏', 'house 动感', '说唱 燃'],
    djTone: '高能、热血、有鼓动性',
  },
  chill: {
    label: '放松解压',
    emoji: '🌿',
    keywords: ['city pop', '轻松 民谣', 'bossa nova', '慵懒 爵士', '解压 轻音乐'],
    djTone: '慵懒、温柔、治愈',
  },
  night: {
    label: '深夜电台',
    emoji: '🌙',
    keywords: ['深夜 抒情', '华语 慢歌', '催眠 轻音乐', '孤独 民谣', 'r&b 夜晚'],
    djTone: '低沉、走心、陪伴感',
  },
  drive: {
    label: '路上开车',
    emoji: '🚗',
    keywords: ['公路 摇滚', '兜风 流行', '英文 节奏', '复古 disco', '动感 华语'],
    djTone: '轻松、有公路感、带点幽默',
  },
  happy: {
    label: '元气满满',
    emoji: '☀️',
    keywords: ['元气 流行', '快乐 日系', '欢快 华语', 'k-pop 活力', '阳光 民谣'],
    djTone: '活泼、明亮、有感染力',
  },
};

export function pickSceneKeyword(sceneKey) {
  const s = SCENES[sceneKey] || SCENES.chill;
  return s.keywords[Math.floor(Math.random() * s.keywords.length)];
}
