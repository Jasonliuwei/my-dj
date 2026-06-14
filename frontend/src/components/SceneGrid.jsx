import React from 'react';

export default function SceneGrid({ scenes, onPick, error }) {
  return (
    <div className="home">
      <h1 className="hero">此刻，<br />想听点什么？</h1>
      <p className="sub">选一个场景，你的专属 DJ 就开播</p>
      {error && <p className="err">{error}</p>}
      <div className="grid">
        {scenes.map((s) => (
          <button key={s.key} className="scene" onClick={() => onPick(s.key)}>
            <span className="emoji">{s.emoji}</span>
            <span className="label">{s.label}</span>
          </button>
        ))}
        {scenes.length === 0 && !error && <p className="muted">加载场景中…</p>}
      </div>
    </div>
  );
}
