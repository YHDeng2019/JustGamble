import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { refreshSessionUser } from '../auth/session';

const Menu = ({ onStartGame, onOnlineMode, onHistory, onSettings, onSwitchUser, stealthMode, onToggleStealth, soundEnabled, onToggleSound }) => {
  const [user, setUser] = useState(null);
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

  // 计算下拉菜单位置
  useEffect(() => {
    if (showSettingsMenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      });
    }
  }, [showSettingsMenu]);

  // 点击外部区域关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target) &&
          buttonRef.current && !buttonRef.current.contains(event.target)) {
        setShowSettingsMenu(false);
      }
    };

    if (showSettingsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettingsMenu]);

  if (!user) return null;

  return (
    <div className="page-container menu-page">
      <div className="menu-bg"></div>
      <div className="menu-header">
        <div className="current-user">
          <span className="user-avatar">{user.avatar}</span>
          <span className="user-name">{user.displayName}</span>
        </div>
        <div className="settings-dropdown">
          <button
            ref={buttonRef}
            className="btn btn-icon settings-toggle-btn"
            onClick={() => setShowSettingsMenu(!showSettingsMenu)}
            title="快捷设置"
          >
            ⚙️
          </button>
        </div>
      </div>

      {showSettingsMenu && ReactDOM.createPortal(
        <div
          ref={settingsRef}
          className="settings-menu"
          style={{
            position: 'fixed',
            top: `${menuPosition.top}px`,
            right: `${menuPosition.right}px`,
            zIndex: 9999
          }}
        >
          <div
            className="settings-menu-item"
            onClick={onToggleStealth}
          >
            <span className="settings-menu-icon">{stealthMode ? '🐟' : '👔'}</span>
            <span className="settings-menu-label">摸鱼模式</span>
            <span className={`settings-menu-toggle ${stealthMode ? 'active' : ''}`}>
              {stealthMode ? 'ON' : 'OFF'}
            </span>
          </div>
          <div
            className="settings-menu-item"
            onClick={onToggleSound}
          >
            <span className="settings-menu-icon">{soundEnabled ? '🔊' : '🔇'}</span>
            <span className="settings-menu-label">音效</span>
            <span className={`settings-menu-toggle ${soundEnabled ? 'active' : ''}`}>
              {soundEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>,
        document.body
      )}

      <h1 className="page-title">JustGamble</h1>

      <div className="menu-content card-panel">
        <div className="player-select">
          <h3>选择游戏人数</h3>
          <div className="player-options">
            {[2, 3, 4, 5, 6].map(count => (
              <div
                key={count}
                className={`player-option ${playerCount === count ? 'selected' : ''}`}
                onClick={() => setPlayerCount(count)}
              >
                {count === 2 ? 'Heads Up (单挑)' : `${count} 人`}
              </div>
            ))}
          </div>
        </div>

        <div className="menu-buttons">
          <button className="btn btn-primary btn-large" onClick={() => onStartGame(playerCount)}>
            🎮 单机游戏
          </button>
          <button className="btn btn-primary btn-large" onClick={onOnlineMode}>
            🌐 联机对战
          </button>
          <button className="btn btn-large" onClick={onHistory}>
            历史对局
          </button>
          <button className="btn btn-large" onClick={onSettings}>
            设置
          </button>
          <button className="btn btn-large" onClick={onSwitchUser}>
            切换用户
          </button>
        </div>
      </div>
    </div>
  );
};

export default Menu;
