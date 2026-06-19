import React, { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api.js';
import { speakBrowser } from '../voice.js';

const BARS = Array.from({ length: 26 });

function greetByHour() {
  const h = new Date().getHours();
  if (h < 5) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export default function DailyRadio() {
  const [phase, setPhase] = useState('landing'); // landing | loading | onair | ended | error
  const [error, setError] = useState('');
  const [greeting, setGreeting] = useState('');
  const [tracks, setTracks] = useState([]);
  const [idx, setIdx] = useState(0);
  const [track, setTrack] = useState(null);
  const [djText, setDjText] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [liked, setLiked] = useState(false);
  const [progress, setProgress] = useState(0);

  const musicRef = useRef(null);
  const djAudioRef = useRef(null);
  const tokenRef = useRef(0);

  const stopVoice = () => {
    if (djAudioRef.current) { djAudioRef.current.pause(); djAudioRef.current.onended = null; }
    window.speechSynthesis?.cancel();
  };

  const speak = useCallback(async (text, token) => {
    if (!text) return;
    setSpeaking(true);
    try {
      const url = await api.tts(text);
      if (token !== tokenRef.current) return;
      if (url) {
        await new Promise((resolve) => {
          const a = (djAudioRef.current = new Audio(url));
          a.onended = resolve; a.onerror = resolve;
          a.play().catch(resolve);
        });
      } else {
        await speakBrowser(text);
      }
    } catch { /* ignore */ }
    if (token === tokenRef.current) setSpeaking(false);
  }, []);

  const playIndex = useCallback(async (i, list) => {
    const token = tokenRef.current;
    const arr = list || tracks;
    if (i >= arr.length) { setPhase('ended'); setPlaying(false); return; }
    const t = arr[i];
    const prev = i > 0 ? arr[i - 1] : null;
    setIdx(i); setTrack(t); setLiked(false); setProgress(0); setDjText('');

    // 1) 串场
    try {
      const data = await api.djIntro(t, prev);
      if (token !== tokenRef.current) return;
      setDjText(data.djText || '');
      await speak(data.djText, token);
    } catch { /* ignore */ }
    if (token !== tokenRef.current) return;

    // 2) 放歌
    const el = musicRef.current;
    if (el && t.url) {
      el.src = t.url;
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }
  }, [tracks, speak]);

  const start = useCallback(async () => {
    tokenRef.current++;
    const token = tokenRef.current;
    setPhase('loading'); setError('');
    try {
      const data = await api.daily(6);
      if (token !== tokenRef.current) return;
      if (!data.tracks || !data.tracks.length) {
        setError(data.message || '没能取到歌曲'); setPhase('error'); return;
      }
      setTracks(data.tracks);
      setGreeting(data.greeting || '');
      setPhase('onair');
      await speak(data.greeting, token);
      if (token !== tokenRef.current) return;
      playIndex(0, data.tracks);
    } catch (e) {
      if (token !== tokenRef.current) return;
      setError('连接服务失败,请稍后重试'); setPhase('error');
    }
  }, [speak, playIndex]);

  const onEnded = () => { if (track) api.feedback(track, 'complete', 'daily').catch(() => {}); playIndex(idx + 1); };
  const onSkip = () => { if (track) api.feedback(track, 'skip', 'daily').catch(() => {}); stopVoice(); playIndex(idx + 1); };
  const skipIntro = () => { stopVoice(); setSpeaking(false); const el = musicRef.current; if (el && track?.url) { if (!el.src) el.src = track.url; el.play().then(() => setPlaying(true)).catch(() => {}); } };
  const toggle = () => { const el = musicRef.current; if (!el) return; if (el.paused) { el.play(); setPlaying(true); } else { el.pause(); setPlaying(false); } };
  const onLike = () => { if (!track) return; const v = !liked; setLiked(v); api.feedback(track, v ? 'like' : 'skip', 'daily').catch(() => {}); };
  const onTime = () => { const el = musicRef.current; if (el && el.duration) setProgress((el.currentTime / el.duration) * 100); };

  const exit = () => { tokenRef.current++; stopVoice(); musicRef.current?.pause(); setPhase('landing'); setPlaying(false); setSpeaking(false); };

  useEffect(() => () => { tokenRef.current++; stopVoice(); }, []);

  return (
    <div className="dr">
      <audio ref={musicRef} onEnded={onEnded} onTimeUpdate={onTime} />

      {phase === 'landing' && (
        <div className="dr-landing">
          <div className={'dr-wave'}>{BARS.map((_, i) => <span key={i} style={{ animationDelay: `${i * 0.06}s` }} />)}</div>
          <div className="dr-hello">{greetByHour()}，Jason</div>
          <div className="dr-sub">今天为你准备了一张歌单<br />全部来自你的网易云收藏</div>
          <button className="dr-start" onClick={start}>
            <span className="tri">▶</span> 开始今天的电台
          </button>
          <div className="dr-note">点开始,主持人先跟你打个招呼,再一首首放给你听</div>
        </div>
      )}

      {phase === 'loading' && (
        <div className="dr-landing">
          <div className="dr-wave busy">{BARS.map((_, i) => <span key={i} style={{ animationDelay: `${i * 0.06}s` }} />)}</div>
          <div className="dr-sub" style={{ marginTop: 24 }}>正在为你编排今天的歌单…</div>
        </div>
      )}

      {phase === 'error' && (
        <div className="dr-landing">
          <p className="err">{error}</p>
          <button className="dr-start" onClick={start}><span className="tri">▶</span> 再试一次</button>
        </div>
      )}

      {phase === 'ended' && (
        <div className="dr-landing">
          <div className="dr-hello">今天的电台到这里 🌙</div>
          <div className="dr-sub">希望这几首陪你度过了一段好时光</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
            <button className="dr-start" onClick={() => { tokenRef.current++; setPhase('onair'); playIndex(0); }}><span className="tri">▶</span> 再听一遍</button>
            <button className="ghost" onClick={start}>换一批</button>
          </div>
        </div>
      )}

      {phase === 'onair' && (
        <div className="dr-onair">
          <button className="back" onClick={exit}>‹ 返回</button>
          <div className="dr-badge"><span className="live-dot" /> 正在直播 · {Math.min(idx + 1, tracks.length)}/{tracks.length}</div>

          <div className={'dr-disc' + (playing ? ' spin' : '')}>
            {track?.cover ? <img src={track.cover} alt="" /> : <div className="dr-disc-fallback">♪</div>}
          </div>

          <div className={'dr-wave mini' + (playing ? ' on' : '')}>{BARS.slice(0, 18).map((_, i) => <span key={i} style={{ animationDelay: `${i * 0.07}s` }} />)}</div>

          <div className="dr-title">{track?.title || '…'}</div>
          <div className="dr-artist">{track?.artist || ''}</div>

          {speaking && djText && (
            <div className="dj-bubble">
              <span className="dj-tag">DJ</span>
              <span className="dj-text">{djText}</span>
              <button className="ghost sm" onClick={skipIntro}>跳过开场 ›</button>
            </div>
          )}

          <div className="dr-progress"><div style={{ width: progress + '%' }} /></div>

          <div className="controls">
            <button className={'icon' + (liked ? ' liked' : '')} onClick={onLike} aria-label="喜欢">{liked ? '❤️' : '🤍'}</button>
            <button className="icon big" onClick={toggle} aria-label="播放暂停">{playing || speaking ? '⏸' : '▶'}</button>
            <button className="icon" onClick={onSkip} aria-label="下一首">⏭</button>
          </div>
        </div>
      )}
    </div>
  );
}
