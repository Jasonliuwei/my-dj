// 浏览器语音兜底（当后端 TTS 返回 204 时使用）
export function speakBrowser(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = 1.05;
      const zh = window.speechSynthesis.getVoices().find((v) => /zh|Chinese/i.test(v.lang));
      if (zh) u.voice = zh;
      u.onend = resolve;
      u.onerror = resolve;
      window.speechSynthesis.speak(u);
    } catch {
      resolve();
    }
  });
}

// LRC 歌词解析
export function parseLrc(lrc) {
  if (!lrc) return [];
  const lines = [];
  for (const raw of lrc.split('\n')) {
    const m = raw.match(/\[(\d+):(\d+)(?:\.(\d+))?\]/);
    if (!m) continue;
    const t = parseInt(m[1]) * 60 + parseInt(m[2]) + (m[3] ? parseInt(m[3]) / 100 : 0);
    const text = raw.replace(/\[.*?\]/g, '').trim();
    if (text) lines.push({ t, text });
  }
  return lines.sort((a, b) => a.t - b.t);
}
