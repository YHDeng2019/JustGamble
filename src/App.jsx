import React, { useState, useEffect } from 'react';
import { getSessionUser, logoutSession } from './auth/session';
import SelectUser from './pages/SelectUser';
import Menu from './pages/Menu';
import Game from './pages/Game';
import History from './pages/History';
import Settings from './pages/Settings';
import { playMusic, setMusicMuted, unlockAudio, isSoundEnabled, setSoundEnabled } from './game/sound';
import './styles/main.css';

const PAGES = {
  SELECT_USER: 'select_user',
  MENU: 'menu',
  GAME: 'game',
  HISTORY: 'history',
  SETTINGS: 'settings'
};

function App() {
  const [currentPage, setCurrentPage] = useState(PAGES.SELECT_USER);
  const [user, setUser] = useState(null);
  const [playerCount, setPlayerCount] = useState(4);
  const [stealthMode, setStealthMode] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled());

  useEffect(() => {
    const sessionUser = getSessionUser();
    if (sessionUser) {
      setUser(sessionUser);
      setCurrentPage(PAGES.MENU);
    }
  }, []);

  // 首次用户手势解锁音频（浏览器自动播放策略）
  useEffect(() => {
    const handler = () => unlockAudio();
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, []);

  // 根据当前页面切换背景音乐：游戏内用 game BGM，其余界面用 menu BGM
  useEffect(() => {
    if (currentPage === PAGES.GAME) {
      playMusic('game');
    } else {
      playMusic('menu');
    }
  }, [currentPage]);

  // 音量控制：静音时关闭背景音乐
  useEffect(() => {
    setMusicMuted(!soundEnabled);
  }, [soundEnabled]);

  const handleToggleSound = () => {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    setSoundEnabledState(newState);
  };

  const handleSelectUser = (selectedUser) => {
    setUser(selectedUser);
    setCurrentPage(PAGES.MENU);
  };

  const handleStartGame = (count) => {
    setPlayerCount(count);
    setCurrentPage(PAGES.GAME);
  };

  const handleLogout = () => {
    logoutSession();
    setUser(null);
    setCurrentPage(PAGES.SELECT_USER);
  };

  const renderPage = () => {
    switch (currentPage) {
      case PAGES.SELECT_USER:
        return <SelectUser onSelectUser={handleSelectUser} />;
      case PAGES.MENU:
        return (
          <Menu
            onStartGame={handleStartGame}
            onHistory={() => setCurrentPage(PAGES.HISTORY)}
            onSettings={() => setCurrentPage(PAGES.SETTINGS)}
            onSwitchUser={handleLogout}
            stealthMode={stealthMode}
            onToggleStealth={() => setStealthMode(!stealthMode)}
            soundEnabled={soundEnabled}
            onToggleSound={handleToggleSound}
          />
        );
      case PAGES.GAME:
        return (
          <Game
            playerCount={playerCount}
            onBack={() => setCurrentPage(PAGES.MENU)}
            stealthMode={stealthMode}
            onToggleStealth={() => setStealthMode(!stealthMode)}
            soundEnabled={soundEnabled}
            onToggleSound={handleToggleSound}
          />
        );
      case PAGES.HISTORY:
        return <History onBack={() => setCurrentPage(PAGES.MENU)} />;
      case PAGES.SETTINGS:
        return (
          <Settings
            onBack={() => setCurrentPage(PAGES.MENU)}
            onLogout={handleLogout}
          />
        );
      default:
        return <SelectUser onSelectUser={handleSelectUser} />;
    }
  };

  return (
    <div className={`app ${stealthMode ? 'stealth-mode' : ''}`}>
      {renderPage()}
    </div>
  );
}

export default App;
