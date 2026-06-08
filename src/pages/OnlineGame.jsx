import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { OnlineGameEngine } from '../game/onlineEngine';
import { getRoom, leaveRoom } from '../services/roomService';
import { startHeartbeat, stopHeartbeat } from '../services/heartbeatService';
import { describeCurrentHand } from '../game/handEval';
import { GAME_STAGES } from '../game/engine';
import Table from '../ui/Table';
import ActionBar from '../ui/ActionBar';
import GameLog from '../ui/GameLog';
import { playSound } from '../game/sound';

const OnlineGame = ({ roomId, user, onExit, stealthMode, onToggleStealth, soundEnabled, onToggleSound }) => {
  const [room, setRoom] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [actionBarVisible, setActionBarVisible] = useState(false);
  const [actionBarReady, setActionBarReady] = useState(false);
  const [gameLog, setGameLog] = useState([]);
  const [logCollapsed, setLogCollapsed] = useState(false);
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('connected');
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const [winnerHighlight, setWinnerHighlight] = useState(null);
  const [roundToast, setRoundToast] = useState(null);
  const [allInFlash, setAllInFlash] = useState(null);
  const [yourTurn, setYourTurn] = useState(false);
  const [thinkingAi, setThinkingAi] = useState(null);

  const engineRef = useRef(null);
  const isHost = room?.hostId === user.userId;
  const lastUpdateTimeRef = useRef(Date.now());
  const settingsRef = useRef(null);
  const buttonRef = useRef(null);
  const wasMyTurnRef = useRef(false);
  const prevStageRef = useRef(null);

  useEffect(() => {
    let unsubscribe = null;

    const loadRoom = async () => {
      try {
        const roomData = await getRoom(roomId);
        if (!roomData) {
          setError('房间不存在');
          return;
        }
        setRoom(roomData);

        const isRoomHost = roomData.hostId === user.userId;
        console.log('[联机游戏] 初始化引擎，房主:', isRoomHost);

        engineRef.current = new OnlineGameEngine(roomId, user.userId, isRoomHost);

        if (isRoomHost) {
          console.log('[联机游戏] 房主初始化游戏状态...');
          await engineRef.current.initGame(roomData);
          console.log('[联机游戏] 游戏状态初始化完成');
        }

        unsubscribe = engineRef.current.subscribeToGameState((state) => {
          console.log('[联机游戏] 收到游戏状态更新:', state.stage, '当前玩家索引:', state.currentPlayerIndex);
          console.log('[联机游戏] gameLog:', state.gameLog);

          setGameState(state);

          // 检测阶段变化
          if (prevStageRef.current && prevStageRef.current !== state.stage) {
            console.log('[联机游戏] 阶段切换:', prevStageRef.current, '→', state.stage);
          }
          prevStageRef.current = state.stage;

          // 检测获胜
          if (state.stage === GAME_STAGES.RESULT) {
            handleRoundEnd(state);
          }

          // 检测 AI 思考状态
          const currentPlayer = state.players[state.currentPlayerIndex];
          if (currentPlayer && !currentPlayer.isHuman && !currentPlayer.folded && !currentPlayer.allIn) {
            setThinkingAi(currentPlayer.id);
          } else {
            setThinkingAi(null);
          }

          updateActionBarVisibility(state);

          // 更新最后收到数据的时间
          lastUpdateTimeRef.current = Date.now();
          setConnectionStatus('connected');
        });

        startHeartbeat(roomId, user.userId);
      } catch (err) {
        console.error('[联机游戏] 初始化失败:', err);
        setError('游戏初始化失败: ' + err.message);
      }
    };

    loadRoom();

    // 网络状态检测 - 暂时禁用，避免误报
    lastUpdateTimeRef.current = Date.now();
    setConnectionStatus('connected');

    // 注释掉连接检测，等稳定后再启用
    /*
    const connectionCheck = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastUpdateTimeRef.current;

      if (timeSinceLastUpdate > 30000) {
        setConnectionStatus('disconnected');
      } else if (timeSinceLastUpdate > 15000) {
        setConnectionStatus('reconnecting');
      } else {
        setConnectionStatus('connected');
      }
    }, 3000);
    */

    return () => {
      // clearInterval(connectionCheck);
      if (unsubscribe) {
        unsubscribe();
      }
      stopHeartbeat();
      if (engineRef.current) {
        engineRef.current.cleanup();
      }
    };
  }, [roomId, user.userId]);

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

  // 检测"刚轮到我"的瞬间：提示音 + 视觉脉冲
  useEffect(() => {
    if (!gameState) return;

    const playing = gameState.stage !== GAME_STAGES.WAITING &&
                    gameState.stage !== GAME_STAGES.DEALING &&
                    gameState.stage !== GAME_STAGES.RESULT &&
                    !roundToast;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const isMyTurn = playing && currentPlayer && currentPlayer.id === user.userId && !currentPlayer.folded;

    if (isMyTurn && !wasMyTurnRef.current) {
      // 刚转入我的回合
      setYourTurn(true);
      playSound('yourturn', !soundEnabled);
    } else if (!isMyTurn && yourTurn) {
      setYourTurn(false);
    }

    wasMyTurnRef.current = isMyTurn;
  }, [gameState, roundToast, soundEnabled, user.userId, yourTurn]);

  const updateActionBarVisibility = (state) => {
    if (!state) return;

    const currentPlayer = state.players[state.currentPlayerIndex];
    const isMyTurn = currentPlayer?.id === user.userId;
    const canAct = isMyTurn &&
                   !currentPlayer.folded &&
                   !currentPlayer.allIn &&
                   currentPlayer.chips > 0; // 筹码为0不能操作

    if (canAct) {
      // 短暂延迟后显示 ActionBar，避免连续决策时无间隔
      setActionBarVisible(true);
      setActionBarReady(false);
      setTimeout(() => {
        setActionBarReady(true);
      }, 600);
    } else {
      setActionBarVisible(false);
      setActionBarReady(false);
    }
  };

  const handleRoundEnd = (state) => {
    // 从 lastShowdownResult 或构造获胜结果
    const result = engineRef.current?.engine?.lastShowdownResult;

    if (!result) {
      // 没有摊牌数据，说明是弃牌结束
      const activePlayers = state.players.filter(p => !p.folded);
      if (activePlayers.length === 1) {
        const winner = activePlayers[0];
        showWinnerToast({
          winners: { [winner.id]: state.pot },
          playerHands: {},
          bestHand: ''
        }, state);
      }
      return;
    }

    showWinnerToast(result, state);
  };

  const showWinnerToast = (result, state) => {
    const winnerIds = Object.keys(result.winners);
    const winnerNames = winnerIds.map(id => state.players.find(p => p.id === id)?.name).filter(Boolean);

    setWinnerHighlight(winnerIds);

    // 是否摊牌
    const isShowdown = result.playerHands && Object.keys(result.playerHands).length > 0;

    const iWon = winnerIds.includes(user.userId);
    const profit = result.winners[user.userId] || 0;

    let toastText;
    if (iWon) {
      toastText = isShowdown && result.bestHand
        ? `🏆 你赢了 +${profit}（${result.bestHand}）`
        : `🏆 你赢了 +${profit}`;
    } else {
      toastText = `${winnerNames.join('、')} 赢得底池`;
    }

    setRoundToast({ text: toastText, type: iWon ? 'win' : 'lose' });
    playSound(iWon ? 'win' : 'lose', !soundEnabled);

    // 摊牌后停留更久（看清对手牌+牌型），弃牌结束也需要足够时间消化信息
    const nextDelay = isShowdown ? 6500 : 3500;
    setTimeout(() => {
      setRoundToast(null);
      setWinnerHighlight(null);
    }, nextDelay);
  };

  const getValidActions = () => {
    if (!gameState || !engineRef.current) return [];

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== user.userId) return [];
    if (currentPlayer.folded || currentPlayer.allIn) return [];

    try {
      return engineRef.current.engine.getValidActions();
    } catch (err) {
      console.error('[联机游戏] 获取有效动作失败:', err);
      return [];
    }
  };

  // 人类玩家当前牌型提示
  const getHumanHandHint = () => {
    if (!gameState) return '';
    const human = gameState.players.find(p => p.id === user.userId);
    if (!human || human.folded || !human.hand || human.hand.length < 2) return '';
    return describeCurrentHand(human.hand, gameState.communityCards);
  };

  const handleAction = async (action, amount = 0) => {
    if (!engineRef.current) return;

    try {
      await engineRef.current.executeAction(action, amount);
      setActionBarVisible(false);
      setActionBarReady(false);

      // 播放音效
      const soundMap = {
        fold: 'fold',
        check: 'check',
        call: 'chip',
        raise: 'chip'
      };
      playSound(soundMap[action] || 'chip', !soundEnabled);

      // 检测 All-in 戏剧效果
      if (action === 'raise' && gameState) {
        const currentPlayer = gameState.players.find(p => p.id === user.userId);
        if (currentPlayer && amount >= currentPlayer.chips) {
          setAllInFlash(currentPlayer.name);
          playSound('allin', !soundEnabled);
          setTimeout(() => setAllInFlash(null), 1400); // 单人模式时间：1400ms
        }
      }
    } catch (err) {
      console.error('[联机游戏] 执行动作失败:', err);
      setError('操作失败: ' + err.message);
      setTimeout(() => setError(''), 3000);
    }
  };

  const handleExit = async () => {
    if (!confirm('确定要退出游戏吗？你的筹码将丢失。')) {
      return;
    }

    try {
      await leaveRoom(roomId, user.userId);
      onExit();
    } catch (err) {
      console.error('[联机游戏] 退出失败:', err);
      onExit();
    }
  };

  if (error) {
    return (
      <div className="page-container">
        <div className="error-message">
          <h2>⚠️ {error}</h2>
          <button className="btn btn-primary" onClick={onExit}>返回大厅</button>
        </div>
      </div>
    );
  }

  if (!gameState || !gameState.players || gameState.players.length === 0) {
    return (
      <div className="page-container">
        <div className="loading">
          <h2>🎮 游戏加载中...</h2>
          <p>正在同步游戏状态</p>
          <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>
            {isHost ? '正在初始化游戏...' : '等待房主初始化...'}
          </p>
          <button className="btn" onClick={handleExit} style={{ marginTop: '2rem' }}>
            返回大厅
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container game-page">
      {error && (
        <div className="error-toast">
          <span>⚠️ {error}</span>
        </div>
      )}

      {connectionStatus !== 'connected' && (
        <div className={`connection-status ${connectionStatus}`}>
          {connectionStatus === 'reconnecting' ? '🔄 正在重新连接...' : '⚠️ 连接已断开'}
        </div>
      )}

      <div className="game-header">
        <button className="btn btn-small" onClick={handleExit}>退出</button>
        <h2>JustGamble</h2>
        <span className="round-indicator">第 {gameState.roundsPlayed} 局</span>
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

      {gameState && gameState.players && (
        <div className="turn-indicator">
          {(() => {
            const currentPlayer = gameState.players[gameState.currentPlayerIndex];
            if (!currentPlayer) return null;

            const isMyTurn = currentPlayer.id === user.userId;
            const turnText = isMyTurn
              ? '🎯 轮到你了！'
              : `⏳ 等待 ${currentPlayer.name} 行动...`;

            return (
              <div className={`turn-banner ${isMyTurn ? 'my-turn' : 'waiting'}`}>
                {turnText}
              </div>
            );
          })()}
        </div>
      )}

      <Table
        gameState={gameState}
        aiStatus={{}}
        userSettings={{ userId: user.userId }}
        thinkingAi={thinkingAi}
        totalPlayers={gameState.players.length}
        winnerHighlight={winnerHighlight}
        dealingCards={undefined}
        stealthMode={stealthMode}
        allInFlash={allInFlash}
      />

      {actionBarVisible && actionBarReady && (
        <>
          <div className="hand-hint">
            <span className={`your-turn-tag ${yourTurn ? 'pulse' : ''}`}>● 轮到你了</span>
            {getHumanHandHint() && (
              <>
                <span className="hand-hint-label">当前牌型</span>
                <span className="hand-hint-value">{getHumanHandHint()}</span>
              </>
            )}
          </div>
          <ActionBar
            actions={getValidActions()}
            onAction={handleAction}
            disabled={false}
          />
        </>
      )}

      {roundToast && (
        <div className={`round-toast ${roundToast.type}`}>
          {roundToast.text}
        </div>
      )}

      <GameLog
        logs={gameState.gameLog || []}
        collapsed={logCollapsed}
        onToggle={() => setLogCollapsed(!logCollapsed)}
      />

      <div className="game-version">v2026.06.06-online</div>
    </div>
  );
};

export default OnlineGame;
