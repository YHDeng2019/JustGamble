import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { refreshSessionUser } from '../auth/session';
import Avatar from '../ui/Avatar';

const GAMES = [
  {
    id: 'texas',
    name: '德州扑克',
    subtitle: "Texas Hold'em",
    emoji: '🃏',
    desc: '经典德州扑克，AI 对手，LLM 驱动',
    color: '#b638ff',
    glow: 'rgba(182,56,255,0.5)',
    modes: ['solo', 'online'],
  },
  {
    id: 'crazy_texas',
    name: '疯狂德州',
    subtitle: 'Crazy Texas',
    emoji: '🎪',
    desc: '德州扑克 + 道具系统，换牌、偷看、护甲',
    color: '#ff6b35',
    glow: 'rgba(255,107,53,0.5)',
    modes: ['solo', 'online'],
  },
  {
    id: 'niuniu',
    name: '斗牛',
    subtitle: 'Niu Niu',
    emoji: '🐂',
    desc: '湖南经典！五张牌比牛几，庄家模式',
    color: '#06ffa5',
    glow: 'rgba(6,255,165,0.4)',
    modes: ['solo'],
  },
];

const Menu = ({ onSelectGame, onSettings, onSwitchUser, stealthMode, onToggleStealth, soundEnabled, onToggleSound }) => {
  const [user, setUser] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [playerCount, setPlayerCount] = useState(4);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const settingsRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    const currentUser = refreshSessionUser();
    setUser(currentUser);
    if (currentUser?.settings?.defaultPlayers) {
      setPlayerCount(currentUser.settings.defaultPlayers);
    }
  }, []);

  useEffect(() => {
    if (showSettingsMenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      });
    }
  }, [showSettingsMenu]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target) &&
          buttonRef.current && !buttonRef.current.contains(event.target)) {
        setShowSettingsMenu(false);
      }
    };
    if (showSettingsMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettingsMenu]);

  if (!user) return null;

  const handleCardClick = (gameId) => {
    setSelectedGame(selectedGame === gameId ? null : gameId);
  };

  const handlePlay = (mode) => {
    onSelectGame(selectedGame, mode, playerCount);
  };

  const game = GAMES.find(g => g.id === selectedGame);

  return (
    <div className="page-container menu-page">
      <div className="menu-bg"></div>
      <div className="menu-header">
        <div className="current-user">
          <Avatar avatar={user.avatar} size="lg" />
          <span className="user-name">{user.displayName}</span>
        </div>
        <div className="settings-dropdown">
          <button
            ref={buttonRef}
            className="btn btn-icon settings-toggle-btn"
            onClick={() => setShowSettingsMenu(!showSettingsMenu)}
            title="快捷设置"
          >⚙️</button>
        </div>
      </div>

      {showSettingsMenu && ReactDOM.createPortal(
        <div ref={settingsRef} className="settings-menu" style={{ position: 'fixed', top: `${menuPosition.top}px`, right: `${menuPosition.right}px`, zIndex: 9999 }}>
          <div className="settings-menu-item" onClick={onToggleStealth}>
            <span className="settings-menu-icon">{stealthMode ? '🐟' : '👔'}</span>
            <span className="settings-menu-label">摸鱼模式</span>
            <span className={`settings-menu-toggle ${stealthMode ? 'active' : ''}`}>{stealthMode ? 'ON' : 'OFF'}</span>
          </div>
          <div className="settings-menu-item" onClick={onToggleSound}>
            <span className="settings-menu-icon">{soundEnabled ? '🔊' : '🔇'}</span>
            <span className="settings-menu-label">音效</span>
            <span className={`settings-menu-toggle ${soundEnabled ? 'active' : ''}`}>{soundEnabled ? 'ON' : 'OFF'}</span>
          </div>
        </div>,
        document.body
      )}

      <h1 className="page-title">JustGamble</h1>

      <div className="menu-content card-panel">
        {/* 游戏卡片 */}
        <div className="game-center-grid">
          {GAMES.map(g => (
            <div
              key={g.id}
              className={`game-center-card${selectedGame === g.id ? ' expanded' : ''}`}
              style={{ '--gc-color': g.color, '--gc-glow': g.glow }}
              onClick={() => handleCardClick(g.id)}
            >
              <div className="gc-card-main">
                <span className="gc-emoji">{g.emoji}</span>
                <div className="gc-info">
                  <div className="gc-name">{g.name}</div>
                  <div className="gc-subtitle">{g.subtitle}</div>
                  <div className="gc-desc">{g.desc}</div>
                </div>
                <div className={`gc-arrow${selectedGame === g.id ? ' open' : ''}`}>▼</div>
              </div>

              {selectedGame === g.id && (
                <div className="gc-expanded" onClick={e => e.stopPropagation()}>
                  {(g.id === 'texas' || g.id === 'crazy_texas') && (
                    <div className="gc-count-row">
                      <span className="gc-count-label">人数</span>
                      <div className="gc-count-options">
                        {[2, 3, 4, 5, 6].map(n => (
                          <div
                            key={n}
                            className={`gc-count-btn${playerCount === n ? ' selected' : ''}`}
                            onClick={() => setPlayerCount(n)}
                          >{n === 2 ? '2(单挑)' : n}</div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="gc-actions">
                    <button className="btn btn-primary gc-action-btn" onClick={() => handlePlay('solo')}>
                      🎮 单人
                    </button>
                    {g.modes.includes('online') && (
                      <button className="btn btn-primary gc-action-btn" onClick={() => handlePlay('online')}>
                        🌐 联机
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 底部工具按钮 */}
        <div className="menu-buttons menu-util-buttons">
          <button className="btn btn-large" onClick={onSettings}>设置</button>
          <button className="btn btn-large" onClick={onSwitchUser}>切换用户</button>
        </div>
      </div>
    </div>
  );
};

export default Menu;
