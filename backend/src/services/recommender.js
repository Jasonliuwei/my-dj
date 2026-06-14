// 个性化推荐：基于场景候选池 + 学习到的偏好权重打分，挑下一首
import * as source from './source.js';
import { SCENES, pickSceneKeyword } from './scenes.js';
import { getWeights, recentTrackIds, bumpWeight, logEvent } from '../db.js';

// 候选缓存，减少重复请求
const cache = new Map(); // sceneKey -> {ts, list}
const TTL = 5 * 60 * 1000;

async function candidates(sceneKey) {
  const c = cache.get(sceneKey);
  if (c && Date.now() - c.ts < TTL) return c.list;
  // 多取几个关键词，拼成更大的候选池
  const kws = new Set([pickSceneKeyword(sceneKey), pickSceneKeyword(sceneKey)]);
  let list = [];
  for (const kw of kws) {
    try {
      const r = await source.search(kw, 30);
      list = list.concat(r);
    } catch (e) {
      console.error('[recommender] search failed:', e.message);
    }
  }
  // 去重
  const seen = new Set();
  list = list.filter((t) => (seen.has(t.id) ? false : seen.add(t.id)));
  cache.set(sceneKey, { ts: Date.now(), list });
  return list;
}

function scoreTrack(t, weights) {
  let s = Math.random() * 0.5; // 探索性随机
  const artists = (t.artist || '').split(' / ');
  for (const a of artists) s += (weights.artist[a] || 0) * 1.0;
  const title = (t.title || '').toLowerCase();
  for (const [kw, w] of Object.entries(weights.keyword)) {
    if (title.includes(kw.toLowerCase())) s += w * 0.5;
  }
  return s;
}

export async function nextTrack(sceneKey) {
  const pool = await candidates(sceneKey);
  if (!pool.length) return null;
  const weights = getWeights();
  const recent = new Set(recentTrackIds(40));

  // 优先未播放过的；按偏好分排序后从前列随机取一首
  let usable = pool.filter((t) => !recent.has(t.id));
  if (usable.length < 3) usable = pool; // 池子太小就放开

  const ranked = usable
    .map((t) => ({ t, s: scoreTrack(t, weights) }))
    .sort((a, b) => b.s - a.s);

  const topN = ranked.slice(0, Math.min(6, ranked.length));
  const chosen = topN[Math.floor(Math.random() * topN.length)].t;

  // 解析播放地址（网易云部分歌曲可能无版权 -> 往后找可播放的）
  for (const cand of [chosen, ...topN.map((x) => x.t)]) {
    const url = await source.getUrl(cand.id);
    if (url) {
      return { ...cand, url };
    }
  }
  return null;
}

// 反馈学习：根据动作调整权重
export function feedback(track, action, scene) {
  if (!track) return;
  const artists = (track.artist || '').split(' / ').filter(Boolean);
  const delta = action === 'like' ? 2 : action === 'complete' ? 0.5 : action === 'skip' ? -1.5 : 0;
  for (const a of artists) bumpWeight('artist', a, delta);
  // 标题里的中文/英文词也作为弱关键词信号
  if (track.title) {
    for (const w of String(track.title).split(/[\s\-（）()【】\[\]]+/).filter((x) => x.length >= 2)) {
      bumpWeight('keyword', w, delta * 0.3);
    }
  }
  logEvent({ trackId: track.id, title: track.title, artist: track.artist, action, scene });
}

export { SCENES };
