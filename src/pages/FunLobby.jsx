import React, { useState } from 'react';

const GAMES = [
  {
    id: 'texas',
    name: '德州扑克',
    subtitle: 'Texas Hold\'em',
    emoji: '🃏',
    desc: '经典德州扑克，配备道具系统。换牌、偷看、护甲…让牌桌充满变数。',
    color: '#b638ff',
    glow: 'rgba(182,56,255,0.5)',
    available: true,
  },
  {
    id: 'niuNiu',
    name: '斗牛',
    subtitle: 'Niu Niu',
    emoji: '🐂',
    desc: '湖南经典！五张牌比牛几，五花牛、炸弹、五小牛，庄家模式，倍数结算。',
    color: '#ff6b35',
    glow: 'rgba(255,107,53,0.5)',
    available: true,
  },
];

const FunLobby = ({ onBack, onStartTexas, onOnlineTexas, onStartNiuNiu, stealthMode }) => {
  const [selected, setSelected] = useState(null);
  const [playerCount, setPlayerCount] = useState(4);

  const handleGameSelect = (gameId) => {
    setSelected(gameId === selected ? null : gameId);
  };

  const handlePlay = (mode) => {
    if (selected === 'texas') {
      if (mode === 'solo') onStartTexas(playerCount);
      else onOnlineTexas();
    } else if (selected === 'niuNiu') {
      onStartNiuNiu(playerCount);
    }
  };

  return (
    <div className="page-container fun-lobby-page">
      <div className="menu-bg"></div>

      <div className="fun-lobby-header">
        <button className="btn btn-icon fun-lobby-back" onClick={onBack}>←</button>
        <h1 className="fun-lobby-title">🎪 娱乐模式</h1>
        <div style={{ width: 44 }} />
      </div>

      <div className="fun-lobby-content">
        <p className="fun-lobby-subtitle">选择一款游戏开始</p>

        <div className="fun-game-grid">
          {GAMES.map(game => (
            <div
              key={game.id}
              className={`fun-game-card${selected === game.id ? ' selected' : ''}`}
              style={{ '--game-color': game.color, '--game-glow': game.glow }}
              onClick={() => handleGameSelect(game.id)}
            >
              <div className="fun-game-emoji">{game.emoji}</div>
              <div className="fun-game-info">
                <div className="fun-game-name">{game.name}</div>
                <div className="fun-game-subtitle">{game.subtitle}</div>
                <div className="fun-game-desc">{game.desc}</div>
              </div>
              {selected === game.id && <div className="fun-game-check">✓</div>}
            </div>
          ))}
        </div>

        {selected === 'texas' && (
          <div className="fun-lobby-options">
            <div className="fun-lobby-section-title">选择人数</div>
            <div className="player-options" style={{ justifyContent: 'center', marginBottom: 16 }}>
              {[2, 3, 4, 5, 6].map(count => (
                <div
                  key={count}
                  className={`player-option${playerCount === count ? ' selected' : ''}`}
                  onClick={() => setPlayerCount(count)}
                >
                  {count === 2 ? '单挑' : `${count}人`}
                </div>
              ))}
            </div>
            <div className="fun-lobby-actions">
              <button className="btn btn-primary btn-large" onClick={() => handlePlay('solo')}>
                🎮 单人游戏
              </button>
              <button className="btn btn-primary btn-large" onClick={() => handlePlay('online')}>
                🌐 联机对战
              </button>
            </div>
          </div>
        )}

        {selected === 'niuNiu' && (
          <div className="fun-lobby-options">
            <div className="fun-lobby-section-title">选择人数（含你）</div>
            <div className="player-options" style={{ justifyContent: 'center', marginBottom: 16 }}>
              {[2, 3, 4, 5, 6].map(count => (
                <div
                  key={count}
                  className={`player-option${playerCount === count ? ' selected' : ''}`}
                  onClick={() => setPlayerCount(count)}
                >
                  {count === 2 ? '单挑' : `${count}人`}
                </div>
              ))}
            </div>
            <div className="fun-lobby-actions">
              <button className="btn btn-primary btn-large" onClick={() => handlePlay('solo')}>
                🐂 开始斗牛
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FunLobby;
