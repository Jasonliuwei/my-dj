const BASE = '';

async function j(url, opts) {
  const res = await fetch(BASE + url, opts);
  if (!res.ok && res.status !== 204) throw new Error('HTTP ' + res.status);
  return res;
}

export const api = {
  scenes: () => j('/api/scenes').then((r) => r.json()),

  next: (scene, prev) => {
    const p = new URLSearchParams({ scene });
    if (prev) {
      p.set('prevId', prev.id);
      p.set('prevTitle', prev.title || '');
      p.set('prevArtist', prev.artist || '');
    }
    return j('/api/radio/next?' + p.toString()).then((r) => r.json());
  },

  feedback: (track, action, scene) =>
    j('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track, action, scene }),
    }),

  // 返回 audio blob url 或 null（null 时前端用浏览器语音）
  tts: async (text) => {
    const res = await j('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.status === 204) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  favorites: () => j('/api/favorites').then((r) => r.json()),
  addFavorite: (track) =>
    j('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ track }),
    }),
  removeFavorite: (id) => j('/api/favorites/' + id, { method: 'DELETE' }),

  stats: () => j('/api/stats').then((r) => r.json()),
  health: () => j('/api/health').then((r) => r.json()),
};
