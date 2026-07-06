import React, { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api.js';
import { speakBrowser } from '../voice.js';

const BARS = Array.from({ length: 26 });
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

function greetByHour() {
  // 固定用中国本地时间(Asia/Shanghai),不依赖设备时区
  let h;
  try {
    h = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', hour: '2-digit', hour12: false }).format(new Date()),
      10
    );
    if (h === 24) h = 0;
  } catch { h = new Date().getHours(); }
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
  <svg viewBox="0 0 24 24" width="20" height="20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 20.3l-1.4-1.27C5.4 14.3 2 11.2 2 7.5 2 5 4 3 6.5 3c1.7 0 3.4.8 4.5 2.1C12.1 3.8 13.8 3 15.5 3 18 3 20 5 20 7.5c0 3.7-3.4 6.8-8.6 11.53z" />
  </svg>
);
const IcSource = () => (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 3a9 9 0 00-9 9v6a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H5v-1a7 7 0 0114 0v1h-1a2 2 0 00-2 2v3a2 2 0 002 2h1a2 2 0 002-2v-6a9 9 0 00-9-9z" /></svg>
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
  const tracksRef = useRef([]);     // 给后台事件回调用(渲染可能被冻结,state 取不到最新)
  const introCacheRef = useRef({}); // 串场缓存: { [i]: { value:{djText,url}|null, promise } }
  const controlRef = useRef({});    // 锁屏媒体控制 → 始终指向最新逻辑

  tracksRef.current = tracks;

  const stopVoice = () => {
    if (djAudioRef.current) { djAudioRef.current.pause(); djAudioRef.current.onended = null; }
    window.speechSynthesis?.cancel();
  };

  // 锁屏/通知栏显示当前曲目信息(配合 MediaSession 动作按钮)
  const setMeta = (t) => {
    if (!('mediaSession' in navigator) || !t) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: t.title || '', artist: t.artist || '', album: '网易云收藏',
        artwork: t.cover ? [{ src: t.cover, sizes: '512x512', type: 'image/jpeg' }] : [],
      });
    } catch {}
  };

  // iOS:在用户点击手势内,用一段静音解锁 <audio>,后续 setTimeout 触发的自动播放才不被拦
  const unlockAudio = () => {
    const el = musicRef.current;
    if (!el) return;
    try {
      el.src = SILENT;
      const p = el.play();
      if (p && p.then) p.then(() => { el.pause(); try { el.currentTime = 0; } catch {} }).catch(() => {});
    } catch {}
  };

  const speak = useCallback(async (text, token) => {
    if (!text) return;
    setSpeaking(true);
    setDjText(''); // 先清空,等声音真正响起再显示字幕,保持同步
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
          // 等 metadata 加载完拿 duration，按时长兜底
          a.onloadedmetadata = () => {
            const d = a.duration;
            if (d && isFinite(d) && d > 0) setTimeout(fin, (d + 2) * 1000);
          };
          a.play().then(() => {
            if (token === tokenRef.current) setDjText(text);
            const d = a.duration;
            if (!d || !isFinite(d) || d <= 0) {
              const est = Math.max(5, text.length * 0.08);
              setTimeout(fin, (est + 3) * 1000);
            }
          }).catch(fin);
          const safe = Math.max(35000, text.length * 100);
          setTimeout(fin, safe);
        });
      } else {
        if (token === tokenRef.current) setDjText(text);
        await Promise.race([speakBrowser(text), new Promise((r) => setTimeout(r, 30000))]);
      }
    } catch { /* ignore */ }
    if (token === tokenRef.current) setSpeaking(false);
  }, []);

  // 取/预取某首的串场词 + 语音(blob),缓存到 introCacheRef[i]。
  // value 就绪后可在后台同步读取(锁屏续播时不能联网/等待)。
  const getIntro = useCallback((i, arr) => {
    const list = arr || tracksRef.current;
    if (!list || i < 0 || i >= list.length) return null;
    if (introCacheRef.current[i]) return introCacheRef.current[i];
    const entry = { value: null, promise: null };
    entry.promise = (async () => {
      let v = { djText: '', url: null };
      try {
        const d = await api.djIntro(list[i], i > 0 ? list[i - 1] : null);
        const text = d.djText || '';
        // 只预取文案;语音用网络 GET 地址按需流式合成(锁屏后台也能播,且不必提前烧 TTS)
        v = { djText: text, url: text ? api.ttsUrl(text) : null };
      } catch { /* ignore，留空降级 */ }
      entry.value = v;
      return v;
    })();
    introCacheRef.current[i] = entry;
    return entry;
  }, []);

  // 串行把整张歌单的串场都预取好(前台联网时完成,锁屏后才有 blob 可用)
  const prefetchAll = useCallback(async (arr) => {
    for (let i = 0; i < arr.length; i++) {
      const e = getIntro(i, arr);
      if (e && !e.value) { try { await e.promise; } catch {} }
    }
  }, [getIntro]);

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

    // 取串场词 + 语音:走缓存(预取好则秒开),没有就现取并缓存
    let intro = '';
    let url = null;
    const entry = getIntro(i, arr);
    if (entry) {
      const v = entry.value || await entry.promise;
      if (token !== tokenRef.current) return;
      intro = v.djText || ''; url = v.url || null;
    }

    // 顺手把下一首也预取好(为锁屏续播准备;网络只在前台可用)
    getIntro(i + 1, arr);

    const startMusicNow = () => {
      if (!el || !t.url) return;
      // 已经在播这一首就别打断;但若上次 play() 被拒(元素仍是暂停)要允许重试,
      // 否则垫入定时器那次失败后,onended 会因 cur===id 直接 return,导致歌再也不播
      if (el.dataset.cur === t.id && !el.paused) return;
      el.volume = 0.3;
      el.dataset.seg = 'song'; el.dataset.segIdx = String(i); // 给 onEnded 判段用
      el.dataset.cur = t.id;
      if (el.src !== t.url) el.src = t.url;
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      setMeta(t);
    };

    // 播 DJ 串场,并在结束前约 3.5s 让歌曲垫入(人声与音乐重叠,音量不变)
    setSpeaking(true);
    await new Promise((resolve) => {
      let done = false;
      const timers = [];
      const fin = () => { if (done) return; done = true; timers.forEach(clearTimeout); resolve(); };
      const startIfCurrent = () => { if (token === tokenRef.current) startMusicNow(); };
      if (url) {
        const a = (djAudioRef.current = new Audio(url));
        a.onloadedmetadata = () => {
          const d = a.duration;
          if (d && isFinite(d)) {
            const lead = Math.max(0, (d - 3.5) * 1000);
            timers.push(setTimeout(startIfCurrent, lead));
          }
        };
        a.onended = () => { startIfCurrent(); fin(); };
        a.onerror = () => { startIfCurrent(); fin(); };
        a.play().then(() => { if (token === tokenRef.current) setDjText(intro); }).catch(() => { startIfCurrent(); fin(); });
        const introSafe = Math.max(35000, intro.length * 100);
        timers.push(setTimeout(() => { startIfCurrent(); fin(); }, introSafe));
      } else {
        timers.push(setTimeout(startIfCurrent, 4000));
        if (token === tokenRef.current) setDjText(intro);
        speakBrowser(intro).then(() => { startIfCurrent(); fin(); });
        timers.push(setTimeout(() => { startIfCurrent(); fin(); }, 30000));
      }
    });
    if (token === tokenRef.current) setSpeaking(false);
    if (token === tokenRef.current && musicRef.current) musicRef.current.volume = 1.0;
  }, [tracks]);

  const start = useCallback(async () => {
    unlockAudio(); // 必须在点击手势内解锁音频
    tokenRef.current++;
    const token = tokenRef.current;
    setPhase('loading'); setError('');
    try {
      const data = await api.daily(6);
      if (token !== tokenRef.current) return;
      if (!data.tracks || !data.tracks.length) { setError(data.message || '没能取到歌曲'); setPhase('error'); return; }
      setTracks(data.tracks);
      tracksRef.current = data.tracks;
      introCacheRef.current = {};
      setPhase('onair');
      prefetchAll(data.tracks); // 问候期间把整张歌单的串场都预取好,锁屏后才能带串场续播
      await speak(data.greeting, token);
      if (token !== tokenRef.current) return;
      playIndex(0, data.tracks);
    } catch {
      if (token !== tokenRef.current) return;
      setError('连接服务失败,请稍后重试'); setPhase('error');
    }
  }, [speak, playIndex, prefetchAll]);

  // 切歌统一入口:作废旧任务 + 停掉旧语音
  const go = (i) => { tokenRef.current++; stopVoice(); setSpeaking(false); playIndex(i); };

  // 后台只在主元素上直接放歌(跳过串场,锁屏手动切歌用)
  const bgPlaySong = (i) => {
    const arr = tracksRef.current;
    const t = arr[i]; const el = musicRef.current;
    if (!el || !t || !t.url) return;
    setSpeaking(false); setDjText('');
    el.dataset.seg = 'song'; el.dataset.segIdx = String(i); el.dataset.cur = t.id;
    el.src = t.url;
    el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    setMeta(t);
  };

  // 后台/锁屏续播:有预取好的串场就先在主元素放 DJ 语音,再接歌;没有就直接放歌。
  // 全程只用已解锁的主元素,不新建 Audio、不联网、不依赖定时器。
  const bgPlay = useCallback((i, withDj = true) => {
    const arr = tracksRef.current;
    if (i < 0) return;
    if (i >= arr.length) { setPhase('ended'); setPlaying(false); return; }
    tokenRef.current++;   // 作废任何进行中的前台串场任务
    stopVoice();
    const t = arr[i];
    setIdx(i); setTrack(t); setLiked(false); setProgress(0);
    const el = musicRef.current;
    if (!el || !t.url) return;
    const entry = introCacheRef.current[i];
    const djUrl = withDj && entry && entry.value ? entry.value.url : null;
    if (djUrl) {
      setSpeaking(true); setDjText(entry.value.djText || '');
      el.dataset.seg = 'dj'; el.dataset.segIdx = String(i); el.dataset.cur = 'dj-' + t.id;
      el.src = djUrl;
      el.play().then(() => setPlaying(true)).catch(() => bgPlaySong(i));
    } else {
      bgPlaySong(i);
    }
    setMeta(t);
  }, []);

  const onEnded = () => {
    const el = musicRef.current;
    const seg = el?.dataset.seg || 'song';
    const i = parseInt(el?.dataset.segIdx ?? String(idx), 10);
    if (seg === 'dj') { bgPlaySong(i); return; } // DJ 说完(后台或解锁瞬间)→ 放本首歌
    if (phase !== 'onair' && !document.hidden) return;
    const t = tracksRef.current[i];
    if (t) api.feedback(t, 'complete', 'daily').catch(() => {});
    if (document.hidden) bgPlay(i + 1); // 锁屏/后台:带串场续播下一首
    else go(i + 1);
  };
  const onSkip = () => { if (track) api.feedback(track, 'skip', 'daily').catch(() => {}); go(idx + 1); };
  const onPrev = () => { go(Math.max(0, idx - 1)); };
  const skipIntro = () => { stopVoice(); setSpeaking(false); const el = musicRef.current; if (el && track?.url) { if (!el.src) el.src = track.url; el.play().then(() => setPlaying(true)).catch(() => {}); } };
  const toggle = () => { const el = musicRef.current; if (!el) return; if (el.paused) { el.play(); setPlaying(true); } else { el.pause(); setPlaying(false); } };
  const onLike = () => { if (!track) return; const v = !liked; setLiked(v); api.feedback(track, v ? 'like' : 'skip', 'daily').catch(() => {}); };
  const onTime = () => { const el = musicRef.current; if (el && el.duration) setProgress((el.currentTime / el.duration) * 100); };
  const exit = () => { tokenRef.current++; stopVoice(); musicRef.current?.pause(); setPhase('landing'); setPlaying(false); setSpeaking(false); };

  // 锁屏控制按钮始终调到最新逻辑(随每次渲染刷新 idx 等)。
  // 手动切歌也带串场(withDj=true),和自动续播一致。
  const liveIdx = () => parseInt(musicRef.current?.dataset.segIdx ?? String(idx), 10); // 后台不重渲染,从 DOM 取真实下标
  controlRef.current = {
    play: () => { musicRef.current?.play(); setPlaying(true); },
    pause: () => { musicRef.current?.pause(); setPlaying(false); },
    next: () => { const i = liveIdx(); if (document.hidden) bgPlay(i + 1, true); else go(i + 1); },
    prev: () => { const p = Math.max(0, liveIdx() - 1); if (document.hidden) bgPlay(p, true); else go(p); },
  };

  // 注册一次媒体会话动作(锁屏/通知栏),处理函数经 controlRef 取最新
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const acts = {
      play: () => controlRef.current.play?.(),
      pause: () => controlRef.current.pause?.(),
      nexttrack: () => controlRef.current.next?.(),
      previoustrack: () => controlRef.current.prev?.(),
    };
    try { Object.entries(acts).forEach(([a, h]) => ms.setActionHandler(a, h)); } catch {}
    return () => { try { Object.keys(acts).forEach((a) => ms.setActionHandler(a, null)); } catch {} };
  }, []);

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
          <div className="dr-topbar">
            <button className="dr-top-btn" onClick={exit} aria-label="返回">‹</button>
            <span className="dr-source"><IcSource /> 网易云收藏</span>
            <span style={{ flex: 1 }} />
            {track && (
              <button className={'dr-top-btn' + (liked ? ' liked' : '')} onClick={onLike} aria-label="喜欢">
                <IcHeart filled={liked} />
              </button>
            )}
          </div>

          <div className="dr-badge"><span className="live-dot" /> {speaking ? (djText ? '主持人 · 正在播报' : '连线中…') : '正在直播'} · {Math.min(idx + 1, tracks.length)}/{tracks.length}</div>

          {speaking ? (
            <div className="dr-talk">
              <div className="dr-wave big">{BARS.map((_, i) => <span key={i} style={{ animationDelay: `${i * 0.06}s` }} />)}</div>
              {djText ? (
                <>
                  <div className="dr-djbig">{djText}</div>
                  <button className="ghost sm" onClick={skipIntro}>跳过,直接听歌 ›</button>
                </>
              ) : (
                <div className="dr-prep">正在连线主持人…</div>
              )}
            </div>
          ) : (
            <>
              <div className={'dr-disc' + (playing ? ' spin' : '')}>
                {track?.cover ? <img src={track.cover} alt="" /> : <div className="dr-disc-fallback">♪</div>}
              </div>
              <div className={'dr-wave mini' + (playing ? ' on' : '')}>{BARS.slice(0, 18).map((_, i) => <span key={i} style={{ animationDelay: `${i * 0.07}s` }} />)}</div>
              <div className="dr-title">{track?.title || '…'}</div>
              <div className="dr-artist">{track?.artist || ''}</div>
              <div className="dr-progress"><div style={{ width: progress + '%' }} /></div>
            </>
          )}

          {(!speaking || djText) && (
            <div className="controls">
              <button className="icon" onClick={onPrev} aria-label="上一首"><IcPrev /></button>
              <button className="icon big" onClick={toggle} aria-label="播放/暂停">{playing || speaking ? <IcPause /> : <IcPlay />}</button>
              <button className="icon" onClick={onSkip} aria-label="下一首"><IcNext /></button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
