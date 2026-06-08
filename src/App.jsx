import React, { useState, useEffect } from 'react';
import { getSessionUser, logoutSession } from './auth/session';
import SelectUser from './pages/SelectUser';
import Menu from './pages/Menu';
import Game from './pages/Game';
import History from './pages/History';
import Settings from './pages/Settings';
import OnlineLobby from './pages/OnlineLobby';
import OnlineWaitingRoom from './pages/OnlineWaitingRoom';
import OnlineGame from './pages/OnlineGame';
import { playMusic, setMusicMuted, unlockAudio, isSoundEnabled, setSoundEnabled } from './game/sound';
import { initFirebase } from './services/firebase';
import './styles/main.css';

const PAGES = {
  SELECT_USER: 'select_user',
  MENU: 'menu',
  GAME: 'game',
  HISTORY: 'history',
  SETTINGS: 'settings',
  ONLINE_LOBBY: 'online_lobby',
  ONLINE_WAITING: 'online_waiting',
  ONLINE_GAME: 'online_game'
};

function App() {
  const [currentPage, setCurrentPage] = useState(PAGES.SELECT_USER);
  const [user, setUser] = useState(null);
  const [playerCount, setPlayerCount] = useState(4);
  const [stealthMode, setStealthMode] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled());
  const [currentRoomId, setCurrentRoomId] = useState(null);

  useEffect(() => {
    const sessionUser = getSessionUser();
    if (sessionUser) {
      setUser(sessionUser);
      setCurrentPage(PAGES.MENU);
    }

    // Firebase 初始化移到用户实际需要时（进入联机大厅）
    // 不在启动时强制初始化，避免未配置时报错
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
    if (currentPage === PAGES.GAME || currentPage === PAGES.ONLINE_GAME) {
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

  const handleOnlineMode = () => {
    setCurrentPage(PAGES.ONLINE_LOBBY);
  };

  const handleRoomJoined = (roomId) => {
    setCurrentRoomId(roomId);
    setCurrentPage(PAGES.ONLINE_WAITING);
  };

  const handleOnlineGameStart = (roomId) => {
    setCurrentRoomId(roomId);
    setCurrentPage(PAGES.ONLINE_GAME);
  };

  const handleExitOnline = () => {
    setCurrentRoomId(null);
    setCurrentPage(PAGES.MENU);
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
            onOnlineMode={handleOnlineMode}
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
      case PAGES.ONLINE_LOBBY:
        return (
          <OnlineLobby
            user={user}
            onRoomJoined={handleRoomJoined}
            onBack={() => setCurrentPage(PAGES.MENU)}
          />
        );
      case PAGES.ONLINE_WAITING:
        return (
          <OnlineWaitingRoom
            roomId={currentRoomId}
            user={user}
            onGameStart={handleOnlineGameStart}
            onBack={handleExitOnline}
          />
        );
      case PAGES.ONLINE_GAME:
        return (
          <OnlineGame
            roomId={currentRoomId}
            user={user}
            onExit={handleExitOnline}
            stealthMode={stealthMode}
            onToggleStealth={() => setStealthMode(!stealthMode)}
            soundEnabled={soundEnabled}
            onToggleSound={handleToggleSound}
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
