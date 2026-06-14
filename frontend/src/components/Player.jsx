import React, { useEffect, useState } from 'react';

export default function Player({
  scene, track, djText, lyric, status, error, liked,
  musicRef, onEnded, onSkipDj, onSkip, onTogglePlay, onLike, onBack, onRetry,
}) {
  const [curLine, setCurLine] = useState('');

  useEffect(() => {
    const el = musicRef.current;
    if (!el) return;
    const onTime = () => {
      if (!lyric.length) return;
      const t = el.currentTime;
      let line = '';
      for (const l of lyric) { if (l.t <= t) line = l.text; else break; }
      setCurLine(line);
    };
    el.addEventListener('timeupdate', onTime);
    return () => el.removeEventListener('timeupdate', onTime);
  }, [lyric, musicRef]);

  const speaking = status === 'dj';
  const loading = status === 'loading';

  return (
    <div className="player">
      <button className="back" onClick={onBack}>‹ 场景</button>
      <div className="scene-chip">{scene?.emoji} {scene?.label}</div>

      <div className={'cover ' + (status === 'playing' ? 'spin' : '')}>
        {track?.cover
          ? <img src={track.cover} alt="" />
          : <div className="cover-fallback">🎵</div>}
      </div>

      {error ? (
        <div className="center">
          <p className="err">{error}</p>
          <button className="primary" onClick={onRetry}>换一首</button>
        </div>
      ) : loading ? (
        <p className="muted center">正在为你挑歌…</p>
      ) : (
        <>
          <div className="meta">
            <div className="title">{track?.title || '—'}</div>
            <div className="artist">{track?.artist || ''}</div>
          </div>

          {speaking && (
            <div className="dj-bubble">
              <span className="dj-tag">DJ</span>
              <span className="dj-text">{djText}</span>
              <button className="ghost sm" onClick={onSkipDj}>跳过开场 ›</button>
            </div>
          )}

          {!speaking && curLine && <div className="lyric">{curLine}</div>}
        </>
      )}

      <audio ref={musicRef} onEnded={onEnded} />

      <div className="controls">
        <button className={'icon ' + (liked ? 'liked' : '')} onClick={onLike} title="喜欢">
          {liked ? '❤️' : '🤍'}
        </button>
        <button className="icon big" onClick={onTogglePlay} title="播放/暂停">
          {status === 'playing' || status === 'dj' ? '⏸' : '▶'}
        </button>
        <button className="icon" onClick={onSkip} title="下一首">⏭</button>
      </div>
    </div>
  );
}
