import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export default function NeteaseLikes() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [playingId, setPlayingId] = useState(null);
  const [onlyPlayable, setOnlyPlayable] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    api.neteaseLikes().then(setData).catch(() => setErr('加载失败，请稍后重试'));
  }, []);

  const play = async (s) => {
    const el = audioRef.current;
    if (!el) return;
    if (playingId === s.id) {
      el.pause();
      setPlayingId(null);
      return;
    }
    try {
      const { url } = await api.trackUrl(s.id);
      if (!url) {
        setErr('《' + s.title + '》暂时拿不到播放地址');
        return;
      }
      setErr('');
      el.src = url;
      el.play();
      setPlayingId(s.id);
    } catch {
      setErr('播放失败');
    }
  };

  if (err && !data) return <div className="panel"><h2>我的网易云收藏</h2><p className="err">{err}</p></div>;
  if (!data) return <div className="panel"><h2>我的网易云收藏</h2><p className="muted">正在从网易云拉取你「喜欢的音乐」…（歌多的话要几秒）</p></div>;
  if (data.error) return (
    <div className="panel">
      <h2>我的网易云收藏</h2>
      <p className="err">{data.message || data.error}</p>
      {data.error === 'not_logged_in' && <p className="muted">解决办法：重新获取网易云 MUSIC_U Cookie，更新到服务器 .env 后重启。</p>}
    </div>
  );

  const list = onlyPlayable ? data.songs.filter((s) => s.playable) : data.songs;

  return (
    <div className="panel">
      <h2>我的网易云收藏</h2>
      <p className="muted">
        共 {data.total} 首 · 可播放 {data.playableCount} 首
        {data.total > data.shown ? `（仅显示前 ${data.shown} 首）` : ''}
      </p>
      {err && <p className="err">{err}</p>}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 14px', fontSize: 14, color: 'var(--muted)' }}>
        <input type="checkbox" checked={onlyPlayable} onChange={(e) => setOnlyPlayable(e.target.checked)} />
        只看可播放的
      </label>

      {list.map((s) => (
        <div key={s.id} className="row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {s.cover ? (
              <img src={s.cover + '?param=80y80'} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--card)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>🎵</div>
            )}
            <div style={{ minWidth: 0 }}>
              <div className="t" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</div>
              <div className="a" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.artist}</div>
            </div>
          </div>
          <div style={{ flexShrink: 0, marginLeft: 10 }}>
            {s.playable ? (
              <button className="ghost sm" onClick={() => play(s)}>{playingId === s.id ? '⏸ 暂停' : '▶ 试听'}</button>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>无版权</span>
            )}
          </div>
        </div>
      ))}

      <audio ref={audioRef} onEnded={() => setPlayingId(null)} />
    </div>
  );
}
