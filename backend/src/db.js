import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import config from './config.js';

const dbPath = path.resolve(process.cwd(), config.dbFile);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// ---- 表结构 ----
db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  track_id TEXT NOT NULL,
  title TEXT,
  artist TEXT,
  action TEXT NOT NULL,          -- play | like | skip | complete
  scene TEXT,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS weights (
  kind TEXT NOT NULL,            -- artist | keyword
  name TEXT NOT NULL,
  score REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (kind, name)
);
CREATE TABLE IF NOT EXISTS favorites (
  track_id TEXT PRIMARY KEY,
  title TEXT,
  artist TEXT,
  album TEXT,
  cover TEXT,
  duration INTEGER DEFAULT 0,
  heart_count INTEGER NOT NULL DEFAULT 1,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_track ON events(track_id);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
`);

const favCols = db.prepare(`PRAGMA table_info(favorites)`).all().map((c) => c.name);
for (const [name, type] of [
  ['album', 'TEXT'],
  ['cover', 'TEXT'],
  ['duration', 'INTEGER DEFAULT 0'],
  ['heart_count', 'INTEGER NOT NULL DEFAULT 1'],
]) {
  if (!favCols.includes(name)) db.exec(`ALTER TABLE favorites ADD COLUMN ${name} ${type}`);
}

// ---- 事件记录 ----
const insEvent = db.prepare(
  `INSERT INTO events (track_id,title,artist,action,scene,ts) VALUES (?,?,?,?,?,?)`
);
export function logEvent({ trackId, title, artist, action, scene }) {
  insEvent.run(String(trackId), title || '', artist || '', action, scene || '', Date.now());
}

// ---- 偏好权重调整 ----
const upWeight = db.prepare(`
  INSERT INTO weights (kind,name,score) VALUES (?,?,?)
  ON CONFLICT(kind,name) DO UPDATE SET score = score + excluded.score
`);
export function bumpWeight(kind, name, delta) {
  if (!name) return;
  upWeight.run(kind, String(name).trim(), delta);
}

export function getWeights() {
  const rows = db.prepare(`SELECT kind,name,score FROM weights`).all();
  const artist = {}, keyword = {};
  for (const r of rows) {
    (r.kind === 'artist' ? artist : keyword)[r.name] = r.score;
  }
  return { artist, keyword };
}

// ---- 最近播放（用于去重） ----
export function recentTrackIds(limit = 40) {
  return db
    .prepare(`SELECT DISTINCT track_id FROM events WHERE action IN ('play','complete') ORDER BY ts DESC LIMIT ?`)
    .all(limit)
    .map((r) => r.track_id);
}

// ---- 收藏 ----
const insFav = db.prepare(`
  INSERT INTO favorites (track_id,title,artist,album,cover,duration,heart_count,ts)
  VALUES (?,?,?,?,?,?,?,?)
  ON CONFLICT(track_id) DO UPDATE SET
    title = excluded.title,
    artist = excluded.artist,
    album = excluded.album,
    cover = excluded.cover,
    duration = excluded.duration,
    ts = excluded.ts
`);
const delFav = db.prepare(`DELETE FROM favorites WHERE track_id = ?`);
export function addFavorite(t) {
  insFav.run(
    String(t.id),
    t.title || '',
    t.artist || '',
    t.album || '',
    t.cover || '',
    t.duration || 0,
    Math.min(Math.max(parseInt(t.heartCount || t.heart_count || 1, 10) || 1, 1), 5),
    Date.now()
  );
}
export function removeFavorite(id) {
  delFav.run(String(id));
}
export function listFavorites() {
  return db.prepare(`
    SELECT track_id as id,title,artist,album,cover,duration,heart_count as heartCount,ts
    FROM favorites
    ORDER BY ts DESC
  `).all();
}

const incHeart = db.prepare(`
  INSERT INTO favorites (track_id,title,artist,album,cover,duration,heart_count,ts)
  VALUES (?,?,?,?,?,?,1,?)
  ON CONFLICT(track_id) DO UPDATE SET
    title = excluded.title,
    artist = excluded.artist,
    album = excluded.album,
    cover = excluded.cover,
    duration = excluded.duration,
    heart_count = CASE WHEN favorites.heart_count >= 5 THEN 0 ELSE favorites.heart_count + 1 END,
    ts = excluded.ts
  RETURNING heart_count as heartCount
`);
export function incrementHeart(t) {
  const row = incHeart.get(
    String(t.id),
    t.title || '',
    t.artist || '',
    t.album || '',
    t.cover || '',
    t.duration || 0,
    Date.now()
  );
  const heartCount = row?.heartCount ?? 1;
  if (heartCount <= 0) delFav.run(String(t.id));
  return heartCount;
}

export function getFavoriteHeartMap(ids = []) {
  if (!ids.length) return {};
  const unique = [...new Set(ids.map(String))];
  const placeholders = unique.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT track_id as id, heart_count as heartCount
    FROM favorites
    WHERE track_id IN (${placeholders})
  `).all(...unique);
  return Object.fromEntries(rows.map((r) => [String(r.id), r.heartCount]));
}

export function topHeartFavorites(limit = 20) {
  return db.prepare(`
    SELECT track_id as id,title,artist,album,cover,duration,heart_count as heartCount,ts
    FROM favorites
    WHERE heart_count > 0
    ORDER BY heart_count DESC, ts DESC
    LIMIT ?
  `).all(limit);
}

// ---- 简单统计（用于个人主页/数据面板） ----
export function stats() {
  const total = db.prepare(`SELECT COUNT(*) c FROM events WHERE action='play'`).get().c;
  const likes = db.prepare(`SELECT COUNT(*) c FROM events WHERE action='like'`).get().c;
  const topArtists = db
    .prepare(`SELECT name,score FROM weights WHERE kind='artist' ORDER BY score DESC LIMIT 8`)
    .all();
  const topKeywords = db
    .prepare(`SELECT name,score FROM weights WHERE kind='keyword' ORDER BY score DESC LIMIT 12`)
    .all();
  return { totalPlays: total, totalLikes: likes, topArtists, topKeywords };
}

export default db;
