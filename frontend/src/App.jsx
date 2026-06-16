import React, { useEffect, useRef, useState, useCallback } from 'react';
import { api } from './api.js';
import { speakBrowser, parseLrc } from './voice.js';
import SceneGrid from './components/SceneGrid.jsx';
import Player from './components/Player.jsx';
import Panel from './components/Panel.jsx';
import NeteaseLikes from './components/NeteaseLikes.jsx';

export default function App() {
  const [scenes, setScenes] = useState([]);
  const [scene, setScene] = useState(null);
  const [track, setTrack] = useState(null);
  const [djText, setDjText] = useState('');
  const [lyric, setLyric] = useState([]);
  const [status, setStatus] = useState('home'); // home | loading | dj | playing | paused | error
  const [error, setError] = useState('');
  const [liked, setLiked] = useState(false);
  const [view, setView] = useState('player'); // player | favorites | stats
  const [favorites, setFavorites] = useState([]);
  const [stats, setStats] = useState(null);

  const musicRef = useRef(null);
  const djAudioRef = useRef(null);
  const tokenRef = useRef(0); // 防止过期加载覆盖
  const prevRef = useRef(null);

  useEffect(() => {
    api.scenes().then(setScenes).catch(() => setError('无法连接后端服务'));
  }, []);

  const playMusic = useCallback((t) => {
    const el = musicRef.current;
    if (!el || !t?.url) return;
    el.src = t.url;
    el.play().then(() => setStatus('playing')).catch(() => setStatus('paused'));
  }, []);

  const loadNext = useCallback(
    async (sceneKey) => {
      const token = ++tokenRef.current;
      setStatus('loading');
      setError('');
      setLiked(false);
      try {
        const data = await api.next(sceneKey, prevRef.current);
        if (token !== tokenRef.current) return;
        setTrack(data.track);
        setDjText(data.djText || '');
        setLyric(parseLrc(data.lyric));
        prevRef.current = { id: data.track.id, title: data.track.title, artist: data.track.artist };

        // 1) 先播 AI 主持人串场
        setStatus('dj');
        if (data.djText) {
          try {
            const url = await api.tts(data.djText);
            if (token !== tokenRef.current) return;
            if (url) {
              await new Promise((resolve) => {
                const a = (djAudioRef.current = new Audio(url));
                a.onended = resolve;
                a.onerror = resolve;
                a.play().catch(resolve);
              });
            } else {
              await speakBrowser(data.djText);
            }
          } catch {/* 忽略串场失败 */}
        }
        if (token !== tokenRef.current) return;
        // 2) 再播歌曲
        playMusic(data.track);
      } catch (e) {
        if (token !== tokenRef.current) return;
        setStatus('error');
        setError('没有找到可播放的歌曲。可换个场景，或在服务器配置网易云 Cookie 解锁更多歌曲。');
      }
    },
    [playMusic]
  );

  const chooseScene = (key) => {
    setScene(key);
    setView('player');
    prevRef.current = null;
    loadNext(key);
  };

  const skipDj = () => {
    if (djAudioRef.current) { djAudioRef.current.pause(); djAudioRef.current.onended = null; }
    window.speechSynthesis?.cancel();
    if (track) playMusic(track);
  };

  const onSkip = () => {
    if (track && scene) api.feedback(track, 'skip', scene).catch(() => {});
    window.speechSynthesis?.cancel();
    if (djAudioRef.current) djAudioRef.current.pause();
    loadNext(scene);
  };

  const onEnded = () => {
    if (track && scene) api.feedback(track, 'complete', scene).catch(() => {});
    loadNext(scene);
  };

  const togglePlay = () => {
    const el = musicRef.current;
    if (!el) return;
    if (el.paused) { el.play(); setStatus('playing'); }
    else { el.pause(); setStatus('paused'); }
  };

  const onLike = () => {
    if (!track || !scene) return;
    const v = !liked;
    setLiked(v);
    api.feedback(track, 'like', scene).catch(() => {});
    if (v) api.addFavorite(track).catch(() => {});
    else api.removeFavorite(track.id).catch(() => {});
  };

  const openFavorites = async () => { setView('favorites'); setFavorites(await api.favorites().catch(() => [])); };
  const openStats = async () => { setView('stats'); setStats(await api.stats().catch(() => null)); };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">🎧 My DJ</div>
        <nav>
          <button className={view === 'player' ? 'on' : ''} onClick={() => setView('player')}>电台</button>
          <button className={view === 'favorites' ? 'on' : ''} onClick={openFavorites}>收藏</button>
          <button className={view === 'netease' ? 'on' : ''} onClick={() => setView('netease')}>网易云收藏</button>
          <button className={view === 'stats' ? 'on' : ''} onClick={openStats}>我的口味</button>
        </nav>
      </header>

      {view === 'player' && !scene && (
        <SceneGrid scenes={scenes} onPick={chooseScene} error={error} />
      )}

      {view === 'player' && scene && (
        <Player
          scene={scenes.find((s) => s.key === scene)}
          track={track}
          djText={djText}
          lyric={lyric}
          status={status}
          error={error}
          liked={liked}
          musicRef={musicRef}
          onEnded={onEnded}
          onSkipDj={skipDj}
          onSkip={onSkip}
          onTogglePlay={togglePlay}
          onLike={onLike}
          onBack={() => { setScene(null); musicRef.current?.pause(); window.speechSynthesis?.cancel(); }}
          onRetry={() => loadNext(scene)}
        />
      )}

      {view === 'favorites' && (
        <Panel title="我的收藏">
          {favorites.length === 0 ? <p className="muted">还没有收藏，去电台点❤️吧</p> :
            favorites.map((f) => (
              <div key={f.id} className="row">
                <div><div className="t">{f.title}</div><div className="a">{f.artist}</div></div>
                <button className="ghost" onClick={async () => { await api.removeFavorite(f.id); setFavorites(await api.favorites()); }}>移除</button>
              </div>
            ))}
        </Panel>
      )}

      {view === 'netease' && <NeteaseLikes />}

      {view === 'stats' && (
        <Panel title="我的口味画像">
          {!stats ? <p className="muted">加载中…</p> : (
            <>
              <p className="muted">累计播放 {stats.totalPlays} 首 · 喜欢 {stats.totalLikes} 次</p>
              <h4>偏爱歌手</h4>
              <div className="tags">{stats.topArtists.map((a) => <span key={a.name} className="tag">{a.name}</span>)}
                {stats.topArtists.length === 0 && <span className="muted">多听几首，这里会越来越懂你</span>}
              </div>
              <h4>关键词</h4>
              <div className="tags">{stats.topKeywords.map((a) => <span key={a.name} className="tag soft">{a.name}</span>)}</div>
            </>
          )}
        </Panel>
      )}
    </div>
  );
}
