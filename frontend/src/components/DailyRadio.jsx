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

const IcPrev = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M7 6h2.2v12H7zM19 6v12l-8.6-6z" /></svg>
);
const IcNext = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><path d="M14.8 6H17v12h-2.2zM5 6l8.6 6L5 18z" /></svg>
);
const IcPlay = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" /></svg>
);
const IcPause = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true"><path d="M7 5h3.4v14H7zM13.6 5H17v14h-3.4z" /></svg>
);
const IcHeart = ({ filled }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 20.3l-1.4-1.27C5.4 14.3 2 11.2 2 7.5 2 5 4 3 6.5 3c1.7 0 3.4.8 4.5 2.1C12.1 3.8 13.8 3 15.5 3 18 3 20 5 20 7.5c0 3.7-3.4 6.8-8.6 11.53z" />
  </svg>
);

export default function DailyRadio() {
  const [phase, setPhase] = useState('landing'); // landing | loading | onair | ended | error
  const [error, setError] = useState('');
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
  const prefetchRef = useRef(null); // 预取的下一首:{ i, djText, url }

  const stopVoice = () => {
    if (djAudioRef.current) { djAudioRef.current.pause(); djAudioRef.current.onended = null; }
    window.speechSynthesis?.cancel();
  };

  const speak = useCallback(async (text, token) => {
    if (!text) return;
    setSpeaking(true);
    try {
      let url = null;
      try {
        url = await Promise.race([
          api.tts(text),
          new Promise((_, rej) => setTimeout(() => rej(new Error('tts-timeout')), 15000)),
        ]);
      } catch { url = null; }
      if (token !== tokenRef.current) return;
      if (url) {
        await new Promise((resolve) => {
          let done = false;
          const fin = () => { if (!done) { done = true; resolve(); } };
          const a = (djAudioRef.current = new Audio(url));
          a.onended = fin; a.onerror = fin;
          a.play().then(() => { const d = a.duration; if (d && isFinite(d)) setTimeout(fin, (d + 1) * 1000); }).catch(fin);
          setTimeout(fin, 30000);
        });
      } else {
        await Promise.race([speakBrowser(text), new Promise((r) => setTimeout(r, 18000))]);
      }
    } catch { /* ignore */ }
    if (token === tokenRef.current) setSpeaking(false);
  }, []);

  // 后台预取某一首的串场词 + 语音,存到 prefetchRef,切歌时直接用
  const prefetch = useCallback(async (i, arr) => {
    if (!arr || i < 0 || i >= arr.length) return;
    if (prefetchRef.current && prefetchRef.current.i === i) return; // 已在预取/已就绪
    prefetchRef.current = { i, djText: '', url: undefined }; // 占位:进行中
    try {
      const d = await api.djIntro(arr[i], i > 0 ? arr[i - 1] : null);
      const text = d.djText || '';
      let url = null;
      try { url = await api.tts(text); } catch { url = null; }
      if (prefetchRef.current && prefetchRef.current.i === i) prefetchRef.current = { i, djText: text, url };
    } catch {
      if (prefetchRef.current && prefetchRef.current.i === i) prefetchRef.current = null;
    }
  }, []);

  const playIndex = useCallback(async (i, list) => {
    const token = tokenRef.current;
    const arr = list || tracks;
    if (i >= arr.length) { setPhase('ended'); setPlaying(false); return; }
    const t = arr[i];
    const prev = i > 0 ? arr[i - 1] : null;
    setIdx(i); setTrack(t); setLiked(false); setProgress(0); setDjText('');

    const el = musicRef.current;
    if (el) el.pause(); // 停掉上一首
    setPlaying(false);

    // 取串场词 + 语音:优先用预取好的(秒开),否则现取
    let intro = '';
    let url = null;
    const pf = prefetchRef.current;
    if (pf && pf.i === i && pf.url !== undefined) {
      intro = pf.djText; url = pf.url; prefetchRef.current = null;
      setDjText(intro);
    } else {
      try {
        const data = await api.djIntro(t, prev);
        if (token !== tokenRef.current) return;
        intro = data.djText || '';
        setDjText(intro);
      } catch { /* ignore */ }
      if (token !== tokenRef.current) return;
      try {
        url = await Promise.race([api.tts(intro), new Promise((_, rej) => setTimeout(() => rej(new Error('t')), 15000))]);
      } catch { url = null; }
      if (token !== tokenRef.current) return;
    }

    // 在本首播放期间,后台预取下一首 → 下次切歌秒开
    prefetch(i + 1, arr);

    const startMusicNow = () => {
      if (!el || !t.url || el.dataset.cur === t.id) return;
      el.dataset.cur = t.id;
      el.src = t.url;
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    };

    // 播 DJ 串场,并在结束前约 3.5s 让歌曲垫入(人声与音乐重叠,音量不变)
    setSpeaking(true);
    await new Promise((resolve) => {
      let done = false;
      const fin = () => { if (!done) { done = true; resolve(); } };
      if (url) {
        const a = (djAudioRef.current = new Audio(url));
        a.onloadedmetadata = () => {
          const d = a.duration;
          if (d && isFinite(d)) {
            const lead = Math.max(0, (d - 3.5) * 1000);
            setTimeout(() => { if (token === tokenRef.current) startMusicNow(); }, lead);
          }
        };
        a.onended = () => { startMusicNow(); fin(); };
        a.onerror = () => { startMusicNow(); fin(); };
        a.play().catch(() => { startMusicNow(); fin(); });
        setTimeout(() => { startMusicNow(); fin(); }, 30000);
      } else {
        setTimeout(() => { if (token === tokenRef.current) startMusicNow(); }, 4000);
        speakBrowser(intro).then(() => { startMusicNow(); fin(); });
        setTimeout(() => { startMusicNow(); fin(); }, 18000);
      }
    });
    if (token === tokenRef.current) setSpeaking(false);
  }, [tracks]);

  const start = useCallback(async () => {
    tokenRef.current++;
    const token = tokenRef.current;
    setPhase('loading'); setError('');
    try {
      const data = await api.daily(6);
      if (token !== tokenRef.current) return;
      if (!data.tracks || !data.tracks.length) { setError(data.message || '没能取到歌曲'); setPhase('error'); return; }
      setTracks(data.tracks);
      setPhase('onair');
      prefetch(0, data.tracks); // 问候播放期间,后台预取第一首,减少开场后的等待
      await speak(data.greeting, token);
      if (token !== tokenRef.current) return;
      playIndex(0, data.tracks);
    } catch {
      if (token !== tokenRef.current) return;
      setError('连接服务失败,请稍后重试'); setPhase('error');
    }
  }, [speak, playIndex]);

  // 切歌统一入口:作废旧任务 + 停掉旧语音
  const go = (i) => { tokenRef.current++; stopVoice(); setSpeaking(false); playIndex(i); };

  const onEnded = () => { if (track) api.feedback(track, 'complete', 'daily').catch(() => {}); go(idx + 1); };
  const onSkip = () => { if (track) api.feedback(track, 'skip', 'daily').catch(() => {}); go(idx + 1); };
  const onPrev = () => { go(Math.max(0, idx - 1)); };
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
          <div className="dr-wave">{BARS.map((_, i) => <span key={i} style={{ animationDelay: `${i * 0.06}s` }} />)}</div>
          <div className="dr-hello">{greetByHour()}，Jason</div>
          <div className="dr-sub">今天为你准备了一张歌单<br />全部来自你的网易云收藏</div>
          <button className="dr-start" onClick={start}><span className="tri">▶</span> 开始今天的电台</button>
          <div className="dr-note">点开始,主持人先跟你聊两句,再一首首放给你听</div>
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
            <button className="icon" onClick={onPrev} aria-label="上一首"><IcPrev /></button>
            <button className="icon big" onClick={toggle} aria-label="播放/暂停">{playing || speaking ? <IcPause /> : <IcPlay />}</button>
            <button className="icon" onClick={onSkip} aria-label="下一首"><IcNext /></button>
          </div>

          <button className={'dr-like' + (liked ? ' on' : '')} onClick={onLike} aria-label="喜欢这首">
            <IcHeart filled={liked} /> {liked ? '已加入喜欢' : '喜欢这首'}
          </button>
        </div>
      )}
    </div>
  );
}
