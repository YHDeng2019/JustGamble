import React, { useState, useEffect } from 'react';
import { getSessionUser, logoutSession } from './auth/session';
import SelectUser from './pages/SelectUser';
import Menu from './pages/Menu';
import Game from './pages/Game';
import NiuNiuGame from './pages/NiuNiuGame';
import NiuNiuOnlineGame from './pages/NiuNiuOnlineGame';
import Settings from './pages/Settings';
import OnlineLobby from './pages/OnlineLobby';
import OnlineWaitingRoom from './pages/OnlineWaitingRoom';
import OnlineGame from './pages/OnlineGame';
import { playMusic, setMusicMuted, unlockAudio, isSoundEnabled, setSoundEnabled } from './game/sound';
import { initFirebase } from './services/firebase';
import './styles/main.css';

const PAGES = {
  SELECT_USER:    'select_user',
  MENU:           'menu',
  GAME:           'game',
  NIU_NIU:        'niu_niu',
  NIU_NIU_LOBBY:  'niu_niu_lobby',
  NIU_NIU_WAITING:'niu_niu_waiting',
  NIU_NIU_ONLINE: 'niu_niu_online',
  SETTINGS:       'settings',
  ONLINE_LOBBY:   'online_lobby',
  ONLINE_WAITING: 'online_waiting',
  ONLINE_GAME:    'online_game',
};

function App() {
  const [currentPage, setCurrentPage] = useState(PAGES.SELECT_USER);
  const [user, setUser] = useState(null);
  const [playerCount, setPlayerCount] = useState(4);
  const [stealthMode, setStealthMode] = useState(false);
  const [soundEnabled, setSoundEnabledState] = useState(isSoundEnabled());
  const [currentRoomId, setCurrentRoomId] = useState(null);
  const [funMode, setFunMode] = useState(false);

  useEffect(() => {
    const sessionUser = getSessionUser();
    if (sessionUser) {
      setUser(sessionUser);
      setCurrentPage(PAGES.MENU);
    }
  }, []);

  useEffect(() => {
    const handler = () => unlockAudio();
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, []);

  useEffect(() => {
    if (currentPage === PAGES.GAME || currentPage === PAGES.ONLINE_GAME ||
        currentPage === PAGES.NIU_NIU || currentPage === PAGES.NIU_NIU_ONLINE) {
      playMusic('game');
    } else {
      playMusic('menu');
    }
  }, [currentPage]);

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

  // gameId: 'texas' | 'crazy_texas' | 'niuniu'
  // mode: 'solo' | 'online'
  const handleSelectGame = (gameId, mode, count = 4) => {
    setPlayerCount(count);
    if (gameId === 'texas') {
      setFunMode(false);
      if (mode === 'solo') setCurrentPage(PAGES.GAME);
      else setCurrentPage(PAGES.ONLINE_LOBBY);
    } else if (gameId === 'crazy_texas') {
      setFunMode(true);
      if (mode === 'solo') setCurrentPage(PAGES.GAME);
      else setCurrentPage(PAGES.ONLINE_LOBBY);
    } else if (gameId === 'niuniu') {
      if (mode === 'online') {
        setCurrentPage(PAGES.NIU_NIU_LOBBY);
      } else {
        setCurrentPage(PAGES.NIU_NIU);
      }
    }
  };

  const handleRoomJoined = (roomId) => {
    setCurrentRoomId(roomId);
    setCurrentPage(PAGES.ONLINE_WAITING);
  };

  const handleOnlineGameStart = (roomId) => {
    setCurrentRoomId(roomId);
    setCurrentPage(PAGES.ONLINE_GAME);
  };

  const handleNiuNiuRoomJoined = (roomId) => {
    setCurrentRoomId(roomId);
    setCurrentPage(PAGES.NIU_NIU_WAITING);
  };

  const handleNiuNiuOnlineStart = (roomId) => {
    setCurrentRoomId(roomId);
    setCurrentPage(PAGES.NIU_NIU_ONLINE);
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

  const sharedProps = {
    stealthMode,
    onToggleStealth: () => setStealthMode(!stealthMode),
    soundEnabled,
    onToggleSound: handleToggleSound,
  };

  const renderPage = () => {
    switch (currentPage) {
      case PAGES.SELECT_USER:
        return <SelectUser onSelectUser={handleSelectUser} />;
      case PAGES.MENU:
        return (
          <Menu
            onSelectGame={handleSelectGame}
            onSettings={() => setCurrentPage(PAGES.SETTINGS)}
            onSwitchUser={handleLogout}
            {...sharedProps}
          />
        );
      case PAGES.GAME:
        return (
          <Game
            playerCount={playerCount}
            funMode={funMode}
            onBack={() => setCurrentPage(PAGES.MENU)}
            {...sharedProps}
          />
        );
      case PAGES.NIU_NIU:
        return (
          <NiuNiuGame
            playerCount={playerCount}
            onBack={() => setCurrentPage(PAGES.MENU)}
            {...sharedProps}
          />
        );
      case PAGES.NIU_NIU_LOBBY:
        return (
          <OnlineLobby
            user={user}
            gameType="niuniu"
            onRoomJoined={handleNiuNiuRoomJoined}
            onBack={() => setCurrentPage(PAGES.MENU)}
          />
        );
      case PAGES.NIU_NIU_WAITING:
        return (
          <OnlineWaitingRoom
            roomId={currentRoomId}
            user={user}
            onGameStart={handleNiuNiuOnlineStart}
            onBack={handleExitOnline}
          />
        );
      case PAGES.NIU_NIU_ONLINE:
        return (
          <NiuNiuOnlineGame
            roomId={currentRoomId}
            user={user}
            onExit={handleExitOnline}
            {...sharedProps}
          />
        );
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
            {...sharedProps}
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
