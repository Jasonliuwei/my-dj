import React, { useEffect, useRef, useState, useCallback } from 'react';
import { api } from '../api.js';
import { speakBrowser, parseLrc } from '../voice.js';

const BARS = Array.from({ length: 26 });
// 主持人话多话少: all=每首都说(默认) / some=隔首开口(第 1、3、5 首前) / off=安静,只放歌
const TALK_MODES = [['all', '每首说'], ['some', '隔首说'], ['off', '安静']];
const talkAt = (mode, i) => mode === 'all' || (mode === 'some' && i % 2 === 0);
const loadTalkMode = () => {
  try { const m = localStorage.getItem('mydj_talk'); return TALK_MODES.some(([k]) => k === m) ? m : 'all'; } catch { return 'all'; }
};
// 记住听到哪了：手机切走后页面常被系统回收,回来整页重载,靠它接着听
const RESUME_KEY = 'mydj_session';
const RESUME_TTL = 6 * 3600 * 1000;
const loadResume = () => {
  try {
    const r = JSON.parse(localStorage.getItem(RESUME_KEY) || 'null');
    return r && Array.isArray(r.tracks) && r.tracks[r.idx] && Date.now() - r.at < RESUME_TTL ? r : null;
  } catch { return null; }
};
const saveResume = (tracks, idx, pos) => {
  try { localStorage.setItem(RESUME_KEY, JSON.stringify({ tracks, idx, pos: Math.floor(pos || 0), at: Date.now() })); } catch {}
};
const clearResume = () => { try { localStorage.removeItem(RESUME_KEY); } catch {} };
const EMBEDDED = (() => { try { return window.parent !== window; } catch { return true; } })();
const closeEmbed = () => { try { window.parent.postMessage({ type: 'mydj-close' }, '*'); } catch {} };
const fmtTime = (s) => (!s || !isFinite(s) ? '0:00' : Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'));
const todayLabel = () => {
  try { return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date()); } catch { return ''; }
};
// 网易云播放地址约 25 分钟过期,超过这个时长就在播放前重新取
const URL_TTL = 15 * 60 * 1000;
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
const IcList = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M4 6h16v2H4zM4 11h16v2H4zM4 16h10v2H4z" /></svg>
);
const IcMic = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 006 6.9V22h2v-3.1A7 7 0 0019 12z" /></svg>
);
const WAVE = Array.from({ length: 34 }, (_, i) => ({ animationDelay: `${((i * 37) % 50) / 100}s`, animationDuration: `${0.38 + ((i * 13) % 9) / 30}s` }));
// 唱臂：轴承座不动，配重 + 臂管 + 唱头整体绕支点 (258,48) 转
const Tonearm = ({ deg }) => (
  <svg className="vr-armsvg" viewBox="0 0 300 300" aria-hidden="true">
    <defs>
      <linearGradient id="vrGold" gradientUnits="userSpaceOnUse" x1="252" x2="264"><stop offset="0" stopColor="#7d6542" /><stop offset=".45" stopColor="#f6e6c4" /><stop offset="1" stopColor="#8a7049" /></linearGradient>
      <linearGradient id="vrSteel" gradientUnits="userSpaceOnUse" x1="248" x2="268"><stop offset="0" stopColor="#191613" /><stop offset=".4" stopColor="#6a5f52" /><stop offset="1" stopColor="#14110f" /></linearGradient>
      <radialGradient id="vrBase" cx=".38" cy=".3"><stop offset="0" stopColor="#4a4238" /><stop offset="1" stopColor="#0f0d0b" /></radialGradient>
      <radialGradient id="vrCap" cx=".36" cy=".3"><stop offset="0" stopColor="#fff3d8" /><stop offset=".6" stopColor="#c9a970" /><stop offset="1" stopColor="#6d5637" /></radialGradient>
    </defs>
    <circle cx="258" cy="48" r="21" fill="url(#vrBase)" stroke="rgba(226,196,140,.45)" />
    <circle cx="258" cy="48" r="14.5" fill="none" stroke="rgba(226,196,140,.25)" />
    <g className="sw" style={{ transform: `rotate(${deg}deg)` }}>
      <rect x="249" y="6" width="18" height="27" rx="4.5" fill="url(#vrSteel)" />
      <rect x="249" y="12" width="18" height="1.2" fill="rgba(255,235,200,.25)" />
      <rect x="255.6" y="30" width="4.8" height="16" fill="url(#vrGold)" />
      <polygon points="255.7,48 260.3,48 259.5,192 256.5,192" fill="url(#vrGold)" />
      <polygon points="256.5,190 259.6,191.5 250.5,212 247.6,210.5" fill="#cdb084" />
      <g transform="rotate(24 249 212)">
        <rect x="241.5" y="204" width="15" height="23" rx="2.5" fill="#f1e6d0" />
        <rect x="241.5" y="204" width="15" height="5" rx="2.5" fill="#c9a970" />
        <rect x="256" y="208.5" width="9" height="2.4" rx="1.2" fill="#c9a970" />
        <rect x="246" y="227" width="6" height="3" rx="1" fill="#2a2520" />
      </g>
    </g>
    <circle cx="258" cy="48" r="8.5" fill="url(#vrCap)" />
    <circle cx="258" cy="48" r="2.4" fill="#2a2219" />
  </svg>
);
const Vinyl = ({ cover, spin }) => (
  <div className={'vr-vinyl' + (spin ? ' spin' : '')}>
    <div className="vr-label">{cover ? <img src={cover} alt="" /> : <span>♪</span>}</div>
  </div>
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
  const [heartCount, setHeartCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [talkPaused, setTalkPaused] = useState(false);
  const [time, setTime] = useState({ cur: 0, dur: 0 });
  const [lyricLine, setLyricLine] = useState('');
  const [queueOpen, setQueueOpen] = useState(false);
  const [talkMode, setTalkMode] = useState(loadTalkMode);
  const [resume, setResume] = useState(loadResume);

  const musicRef = useRef(null);
  const djAudioRef = useRef(null);
  const tokenRef = useRef(0);
  const tracksRef = useRef([]);     // 给后台事件回调用(渲染可能被冻结,state 取不到最新)
  const introCacheRef = useRef({}); // 串场缓存: { [i]: { value:{djText,url}|null, promise } }
  const endTalkRef = useRef(null);      // 立刻结束当前这段主持人播报(清定时器 + 放行后续流程)
  const talkKindRef = useRef(null);     // 'greeting' | 'intro' | null
  const skipIntroOnceRef = useRef(false); // 跳过开场白后,第一首也不再串场
  const seekOnStartRef = useRef(0);     // 续播:歌开始放时先跳到上次的位置
  const lastSaveRef = useRef(0);
  const retriedRef = useRef(null);      // 已为哪首歌重取过播放地址(每首只重试一次)
  const talkModeRef = useRef(talkMode);
  const lyricsRef = useRef({});         // { [trackId]: [{t,text}] }
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
        title: t.title || '', artist: t.artist || '', album: '私人电台',
        artwork: t.cover ? [{ src: t.cover, sizes: '512x512', type: 'image/jpeg' }] : [],
      });
    } catch {}
  };

  // iOS:在用户点击手势内,用一段静音解锁 <audio>,后续 setTimeout 触发的自动播放才不被拦
  const unlockAudio = () => {
    const el = musicRef.current;
    if (!el) return;
    try {
      el.dataset.seg = '';
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
      talkKindRef.current = 'greeting';
      setTalkPaused(false);
      await new Promise((resolve) => {
        let done = false;
        const timers = [];
        const fin = () => { if (done) return; done = true; timers.forEach(clearTimeout); resolve(); };
        endTalkRef.current = fin;
        if (url) {
          const a = (djAudioRef.current = new Audio(url));
          a.onended = fin; a.onerror = fin;
          a.play().then(() => { if (token === tokenRef.current) setDjText(text); }).catch(fin);
          timers.push(setTimeout(fin, Math.max(35000, text.length * 100)));
        } else {
          if (token === tokenRef.current) setDjText(text);
          speakBrowser(text).then(fin);
          timers.push(setTimeout(fin, 30000));
        }
      });
    } catch { /* ignore */ }
    if (token === tokenRef.current) { talkKindRef.current = null; setSpeaking(false); }
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
        const d = await api.djIntro(list[i], i > 0 ? list[i - 1] : null, talkAt(talkModeRef.current, i));
        const text = d.djText || '';
        // 只预取文案;语音用网络 GET 地址按需流式合成(锁屏后台也能播,且不必提前烧 TTS)
        lyricsRef.current[list[i].id] = parseLrc(d.lyric).filter((l) => !/^[^:：]{1,14}[:：]/.test(l.text)); // 去掉「作词：xx」这类署名行
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

  // 重新向后端要一次播放地址(原地址过期/失效时用),成功则写回歌单
  const refreshUrl = async (i) => {
    const t = tracksRef.current[i];
    if (!t) return null;
    const { url } = await api.trackUrl(t.id);
    if (url) { t.url = url; t.urlAt = Date.now(); }
    return url || null;
  };

  const playIndex = useCallback(async (i, list) => {
    const token = tokenRef.current;
    const arr = list || tracks;
    if (i >= arr.length) { clearResume(); setResume(null); setPhase('ended'); setPlaying(false); return; }
    const t = arr[i];
    const prev = i > 0 ? arr[i - 1] : null;
    saveResume(arr, i, seekOnStartRef.current);
    setIdx(i); setTrack(t); setHeartCount(t.heartCount ?? 0); setProgress(0); setTime({ cur: 0, dur: 0 }); setLyricLine(''); setDjText('');

    const el = musicRef.current;
    if (el) el.pause(); // 停掉上一首
    setPlaying(false);

    const skipTalk = skipIntroOnceRef.current;
    skipIntroOnceRef.current = false;
    const talk = talkAt(talkModeRef.current, i) && !skipTalk;

    // 歌单是一次性取的,轮到后面的歌时地址可能已过期 → 先换新地址
    if (Date.now() - (t.urlAt || 0) > URL_TTL) {
      try { await refreshUrl(i); } catch {}
      if (token !== tokenRef.current) return;
    }

    // 取串场词 + 语音:走缓存(预取好则秒开),没有就现取并缓存。不串场的歌不用等它
    let intro = '';
    let url = null;
    const entry = getIntro(i, arr);
    if (talk && entry) {
      const v = entry.value || await entry.promise;
      if (token !== tokenRef.current) return;
      intro = v.djText || ''; url = v.url || null;
    }

    // 顺手把下一首也预取好(为锁屏续播准备;网络只在前台可用)
    getIntro(i + 1, arr);

    const startMusicNow = (underDj = false) => {
      const src = tracksRef.current[i]?.url || t.url;
      if (!el || !src) return;
      // 已经在播这一首就别打断;但若上次 play() 被拒(元素仍是暂停)要允许重试,
      // 否则垫入定时器那次失败后,onended 会因 cur===id 直接 return,导致歌再也不播
      if (el.dataset.cur === t.id && !el.paused) return;
      el.volume = underDj ? 0.45 : 1.0;
      el.dataset.seg = 'song'; el.dataset.segIdx = String(i); // 给 onEnded 判段用
      el.dataset.cur = t.id;
      if (el.src !== src) el.src = src;
      if (seekOnStartRef.current > 0) { try { el.currentTime = seekOnStartRef.current; } catch {} seekOnStartRef.current = 0; }
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      setMeta(t);
    };

    // 这首不串场(或没拿到串场词):直接放歌
    if (!intro) { setSpeaking(false); startMusicNow(); return; }

    // 主持人尾部和歌曲轻微重叠，串场结束后恢复歌曲全音量。
    setSpeaking(true); setTalkPaused(false);
    talkKindRef.current = 'intro';
    await new Promise((resolve) => {
      let done = false;
      const timers = [];
      const fin = () => { if (done) return; done = true; timers.forEach(clearTimeout); resolve(); };
      const startIfCurrent = (underDj = false) => { if (token === tokenRef.current) startMusicNow(underDj); };
      // 用户把主持人暂停了:定时器不许偷偷把歌放起来
      const djPaused = () => { const a = djAudioRef.current; return !!a && a.paused && !a.ended; };
      // 跳过/切歌时调用:清掉所有定时器;若仍是当前这首就立刻放歌
      endTalkRef.current = () => { startIfCurrent(); fin(); };
      if (url) {
        const a = (djAudioRef.current = new Audio(url));
        a.volume = 1.0;
        a.onloadedmetadata = () => {
          const d = a.duration;
          if (d && isFinite(d)) {
            timers.push(setTimeout(() => { if (!djPaused()) startIfCurrent(true); }, Math.max(0, (d - 2.8) * 1000)));
          }
        };
        a.onended = () => { startIfCurrent(); fin(); };
        a.onerror = () => { startIfCurrent(); fin(); };
        a.play().then(() => { if (token === tokenRef.current) setDjText(intro); }).catch(() => { startIfCurrent(); fin(); });
        const introSafe = Math.max(35000, intro.length * 100);
        timers.push(setTimeout(() => { if (djPaused()) return; startIfCurrent(); fin(); }, introSafe));
      } else {
        if (token === tokenRef.current) setDjText(intro);
        speakBrowser(intro).then(() => { startIfCurrent(); fin(); });
        timers.push(setTimeout(() => { startIfCurrent(); fin(); }, 30000));
      }
    });
    if (token !== tokenRef.current) return;
    talkKindRef.current = null;
    setSpeaking(false);
    if (musicRef.current) musicRef.current.volume = 1.0;
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
      const now = Date.now();
      data.tracks.forEach((t) => { t.urlAt = now; });
      skipIntroOnceRef.current = false;
      setTracks(data.tracks);
      tracksRef.current = data.tracks;
      introCacheRef.current = {};
      setPhase('onair');
      prefetchAll(data.tracks); // 问候期间把整张歌单的串场都预取好,锁屏后才能带串场续播
      if (talkModeRef.current !== 'off') await speak(data.greeting, token);
      if (token !== tokenRef.current) return;
      playIndex(0, data.tracks);
    } catch {
      if (token !== tokenRef.current) return;
      setError('连接服务失败,请稍后重试'); setPhase('error');
    }
  }, [speak, playIndex, prefetchAll]);

  // 切歌统一入口:作废旧任务 + 停掉旧语音
  // 接着上次听:歌单和进度都从本地取,地址当作已过期重新要,不再念开场白和串场
  const resumeSession = () => {
    const r = loadResume();
    if (!r) { setResume(null); start(); return; }
    unlockAudio();
    tokenRef.current++;
    const list = r.tracks.map((t) => ({ ...t, urlAt: 0 }));
    setTracks(list); tracksRef.current = list;
    introCacheRef.current = {};
    skipIntroOnceRef.current = true;
    seekOnStartRef.current = r.pos > 5 ? r.pos : 0;
    setError(''); setPhase('onair');
    playIndex(r.idx, list);
  };

  // 作废进行中的播报:令牌已 +1,所以 endTalk 只清定时器、不会再启动旧歌
  const cancelTalk = () => { tokenRef.current++; stopVoice(); endTalkRef.current?.(); endTalkRef.current = null; talkKindRef.current = null; };
  const go = (i) => { cancelTalk(); setSpeaking(false); playIndex(i); };

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
    if (i >= arr.length) { clearResume(); setPhase('ended'); setPlaying(false); return; }
    cancelTalk();         // 作废任何进行中的前台串场任务
    const t = arr[i];
    setIdx(i); setTrack(t); setHeartCount(t.heartCount ?? 0); setProgress(0); setTime({ cur: 0, dur: 0 }); setLyricLine('');
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
    if (el?.src.startsWith('data:')) return; // 解锁用的静音片段,不算一首歌
    if (seg === 'dj') { bgPlaySong(i); return; } // DJ 说完(后台或解锁瞬间)→ 放本首歌
    if (phase !== 'onair' && !document.hidden) return;
    const t = tracksRef.current[i];
    if (t) api.feedback(t, 'complete', 'daily').catch(() => {});
    if (document.hidden) bgPlay(i + 1); // 锁屏/后台:带串场续播下一首
    else go(i + 1);
  };
  const onSkip = () => { if (track) api.feedback(track, 'skip', 'daily').catch(() => {}); go(idx + 1); };
  const onPrev = () => { go(Math.max(0, idx - 1)); };
  // 歌曲加载/播放出错:多半是地址过期 → 重取一次接着放;还不行就跳下一首,不让电台卡死
  const onError = async () => {
    const el = musicRef.current;
    if (!el || !el.dataset.seg || el.src.startsWith('data:')) return;
    const i = parseInt(el.dataset.segIdx ?? String(idx), 10);
    if (el.dataset.seg === 'dj') { bgPlaySong(i); return; } // 串场语音坏了 → 直接放歌
    const t = tracksRef.current[i];
    if (!t) return;
    const token = tokenRef.current;
    if (retriedRef.current !== t.id) {
      retriedRef.current = t.id;
      const pos = el.currentTime || 0;
      let url = null;
      try { url = await refreshUrl(i); } catch {}
      if (token !== tokenRef.current) return;
      if (url) {
        el.src = url;
        try { el.currentTime = pos; } catch {}
        el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        return;
      }
    }
    if (document.hidden) bgPlay(i + 1); else go(i + 1);
  };
  // 跳过主持人:开场白 → 连第一首的串场也免了;串场 → 立刻放这首歌
  const skipIntro = () => {
    if (talkKindRef.current === 'greeting') skipIntroOnceRef.current = true;
    stopVoice();
    const end = endTalkRef.current;
    endTalkRef.current = null;
    if (end) end(); else setSpeaking(false);
  };
  const toggle = () => {
    const el = musicRef.current; if (!el) return;
    // 前台播报时,中间按钮控制的是主持人(连同垫在下面的歌)
    if (speaking && el.dataset.seg !== 'dj') {
      const a = djAudioRef.current; if (!a) return;
      if (a.paused) { a.play().catch(() => {}); setTalkPaused(false); }
      else { a.pause(); el.pause(); setPlaying(false); setTalkPaused(true); }
      return;
    }
    if (el.paused) { el.play(); setPlaying(true); } else { el.pause(); setPlaying(false); }
  };
  const onLike = async () => {
    if (!track) return;
    try {
      const data = await api.heartTrack({ ...track, heartCount });
      const next = Math.min(data.heartCount ?? heartCount + 1, 5);
      setHeartCount(next);
      const update = (t) => String(t.id) === String(track.id) ? { ...t, heartCount: next, fromHearts: next > 0 } : t;
      setTrack((t) => t ? update(t) : t);
      setTracks((arr) => arr.map(update));
      tracksRef.current = tracksRef.current.map(update);
      api.feedback(track, 'like', 'daily').catch(() => {});
    } catch {}
  };
  const onTime = (force) => {
    const el = musicRef.current;
    if (!el || !el.duration || el.dataset.seg !== 'song') return;
    if (el.paused && force !== true) return; // 切歌时旧歌暂停也会触发一次,别把刚清零的进度又写回去
    setProgress((el.currentTime / el.duration) * 100);
    setTime({ cur: el.currentTime, dur: el.duration });
    if (Date.now() - lastSaveRef.current > 5000) { // 每 5 秒记一次进度
      lastSaveRef.current = Date.now();
      saveResume(tracksRef.current, parseInt(el.dataset.segIdx || '0', 10), el.currentTime);
    }
    const lines = lyricsRef.current[el.dataset.cur];
    if (lines && lines.length) {
      let line = '';
      for (const l of lines) { if (l.t <= el.currentTime) line = l.text; else break; }
      setLyricLine(line);
    }
  };
  const onSeek = (e) => {
    const el = musicRef.current;
    if (!el || !el.duration || el.dataset.seg !== 'song') return;
    el.currentTime = (Number(e.target.value) / 1000) * el.duration;
    onTime(true);
  };
  const jumpTo = (i) => { setQueueOpen(false); if (i !== idx || speaking) go(i); };
  const changeTalkMode = (m) => {
    talkModeRef.current = m; setTalkMode(m);
    try { localStorage.setItem('mydj_talk', m); } catch {}
    // 还没播到的歌按新设置重新取串场
    const cur = liveIdx();
    Object.keys(introCacheRef.current).forEach((k) => { if (Number(k) > cur) delete introCacheRef.current[k]; });
  };
  const exit = () => { cancelTalk(); musicRef.current?.pause(); setPhase('landing'); setPlaying(false); setSpeaking(false); setQueueOpen(false); setResume(loadResume()); };

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

  const nextTrack = track ? tracks[idx + 1] : tracks[0]; // 开场白期间还没开始放歌
  const onDisc = playing && !speaking;           // 唱针落在唱片上
  const armDeg = onDisc || (!speaking && time.cur > 0) ? 4 + (progress / 100) * 11 : -16; // 随进度从外圈走到内圈

  return (
    <div className="vr">
      <audio ref={musicRef} onEnded={onEnded} onError={onError} onTimeUpdate={onTime} />
      {phase === 'onair' && track?.cover && <div className="vr-amb" style={{ backgroundImage: `url(${track.cover}?param=200y200)` }} />}

      <div className="vr-col">
        {phase === 'landing' && (
          <div className="vr-landing">
            {EMBEDDED && <button className="vr-tbtn vr-home-back" onClick={closeEmbed} aria-label="返回主站">‹</button>}
            <div className="vr-sleeve-wrap">
              <div className="vr-sleeve-disc"><Vinyl /></div>
              <div className="vr-sleeve">
                <small>MY DJ · DAILY PRESSING</small>
                <b>今日<br />歌单</b>
                <small>{todayLabel()}</small>
              </div>
            </div>
            <div className="vr-hello">{greetByHour()}，Jason</div>
            <div className="vr-sub">从你的收藏里挑了 6 首，压成了今天这张唱片</div>
            {resume ? (
              <>
                <button className="vr-start" onClick={resumeSession}><IcPlay /> 接着听</button>
                <div className="vr-resume">第 {resume.idx + 1} 首 · {resume.tracks[resume.idx].title}{resume.pos > 5 ? ` · ${fmtTime(resume.pos)}` : ''}</div>
                <button className="vr-link" onClick={() => { clearResume(); setResume(null); start(); }}>换一张新的</button>
              </>
            ) : (
              <button className="vr-start" onClick={start}><IcPlay /> 放下唱针</button>
            )}
          </div>
        )}

        {phase === 'loading' && (
          <div className="vr-landing">
            <div className="vr-loading-disc"><Vinyl spin /></div>
            <div className="vr-sub">正在为你挑歌、压片…</div>
          </div>
        )}

        {phase === 'error' && (
          <div className="vr-landing">
            <p className="vr-err">{error}</p>
            <button className="vr-start" onClick={start}><IcPlay /> 再试一次</button>
          </div>
        )}

        {phase === 'ended' && (
          <div className="vr-landing">
            <div className="vr-loading-disc"><Vinyl /></div>
            <div className="vr-hello">这一面放完了</div>
            <div className="vr-sub">希望这几首陪你度过了一段好时光</div>
            <div className="vr-end-btns">
              <button className="vr-start" onClick={() => { tokenRef.current++; setPhase('onair'); playIndex(0); }}><IcPlay /> 再听一遍</button>
              <button className="vr-ghost" onClick={start}>换一张</button>
            </div>
          </div>
        )}

        {phase === 'onair' && (
          <div className={'vr-onair' + (speaking ? ' talk' : '')}>
            <div className="vr-top">
              <button className="vr-tbtn" onClick={exit} aria-label="返回">‹</button>
              <span className={'vr-lamp' + (speaking ? ' on' : '')}><i /> ON AIR</span>
              {track ? (
                <button className={'vr-tbtn vr-heart' + (heartCount ? ' liked' : '')} onClick={onLike} aria-label="喜欢">
                  <IcHeart filled={heartCount > 0} />
                  {heartCount > 1 && <span className="vr-heart-n">{heartCount}</span>}
                </button>
              ) : <span className="vr-tbtn" />}
            </div>

            <div className="vr-deck">
              <div className="vr-floor" />
              <div className="vr-platter" />
              <div className="vr-strobe" />
              <div className="vr-mat" />
              <Vinyl cover={track?.cover ? track.cover + '?param=300y300' : ''} spin={onDisc} />
              <div className="vr-sheen" />
              <div className="vr-spindle" />
              <Tonearm deg={armDeg} />
            </div>

            {/* 说话区：主持人开口时,歌名歌词的位置换成声波 + 字幕 */}
            <div className="vr-slot">
              {speaking ? (
                <div className="vr-host" key={'h' + idx}>
                  <div className={'vr-wave' + (djText && !talkPaused ? '' : ' idle')}>{WAVE.map((st, i) => <i key={i} style={st} />)}</div>
                  <div className="vr-say" key={djText ? 't' : 'w'}>
                    {djText
                      ? djText.split(' ').map((w, i) => <span className="vr-w" key={i} style={{ animationDelay: `${(i * 0.26).toFixed(2)}s` }}>{w + ' '}</span>)
                      : <span className="vr-wait">主持人正在拿起话筒<span className="vr-dots" /></span>}
                  </div>
                  <div className="vr-upnext">
                    <span>{track ? <>接下来 · <b>{track.title}</b> — {track.artist}</> : `今日歌单 · ${tracks.length} 首，来自你的收藏`}</span>
                    {djText && <button onClick={skipIntro}>跳过 ›</button>}
                  </div>
                </div>
              ) : (
                <div className="vr-meta" key={'m' + idx}>
                  <div className="vr-title">{track ? track.title : '今日歌单'}</div>
                  <div className="vr-artist">{track ? track.artist : `${tracks.length} 首 · 来自你的收藏`}</div>
                  <div className="vr-rule" />
                  <div className="vr-lyric">{lyricLine || '\u00a0'}</div>
                </div>
              )}
            </div>

            <div className="vr-seek">
              <input
                type="range" min="0" max="1000" step="1" aria-label="播放进度"
                value={Math.round(progress * 10)} onChange={onSeek} disabled={speaking || !time.dur}
                style={{ '--p': progress + '%' }}
              />
              <div className="vr-times"><span>{fmtTime(time.cur)}</span><span>{fmtTime(time.dur || (track?.duration || 0) / 1000)}</span></div>
            </div>

            <div className="vr-ctl">
              <button onClick={onPrev} aria-label="上一首"><IcPrev /></button>
              <button className="big" onClick={toggle} aria-label="播放/暂停"><b>{(speaking ? !talkPaused : playing) ? <IcPause /> : <IcPlay />}</b></button>
              <button onClick={onSkip} aria-label="下一首"><IcNext /></button>
            </div>

            <button className="vr-next" onClick={() => setQueueOpen(true)}>
              <IcList />
              <span>{nextTrack ? `接下来 · ${nextTrack.title} — ${nextTrack.artist}` : '这是今天最后一首'}</span>
              <em>{track ? Math.min(idx + 1, tracks.length) : 0}/{tracks.length}</em>
            </button>
          </div>
        )}
      </div>

      {phase === 'onair' && queueOpen && (
        <div className="vr-mask" onClick={() => setQueueOpen(false)}>
          <div className="vr-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="vr-sheet-h">今天这张唱片</div>
            {tracks.map((t, i) => (
              <button key={t.id} className={'vr-row' + (i === idx ? ' cur' : '')} onClick={() => jumpTo(i)}>
                <span className="n">{String(i + 1).padStart(2, '0')}</span>
                <span className="tt"><b>{t.title}</b><small>{t.artist}</small></span>
                {talkAt(talkMode, i) && <span className="mic" title="主持人会在这首前说两句"><IcMic /></span>}
              </button>
            ))}
            <div className="vr-mode">
              <span>主持人</span>
              <div>
                {TALK_MODES.map(([k, label]) => (
                  <button key={k} className={talkMode === k ? 'on' : ''} onClick={() => changeTalkMode(k)}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
