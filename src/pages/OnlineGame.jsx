import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { OnlineGameEngine } from '../game/onlineEngine';
import { getRoom, leaveRoom } from '../services/roomService';
import { startHeartbeat, stopHeartbeat } from '../services/heartbeatService';
import { EMOJIS, sendEmoji, subscribeToEmojis } from '../services/emojiService';
import { sendChatMessage, subscribeToChatMessages } from '../services/chatService';
import { describeCurrentHand } from '../game/handEval';
import { GAME_STAGES } from '../game/engine';
import { addGameHistory } from '../auth/userManager';
import { v4 as uuidv4 } from 'uuid';
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
  const [dealingCards, setDealingCards] = useState(0);
  const [dealingComplete, setDealingComplete] = useState(false);
  const [isGameStarting, setIsGameStarting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [gameStartTime, setGameStartTime] = useState(null);
  const [showHandGuide, setShowHandGuide] = useState(false);
  const [showChatBox, setShowChatBox] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');

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
          setGameStartTime(Date.now()); // 记录游戏开始时间
        } else {
          setGameStartTime(Date.now()); // 非房主也记录开始时间
        }

        unsubscribe = engineRef.current.subscribeToGameState((state) => {
          console.log('[联机游戏] 收到游戏状态更新:', state.stage, '当前玩家索引:', state.currentPlayerIndex);
          console.log('[联机游戏] gameLog:', state.gameLog);

          // 检测游戏首次启动（从 DEALING 阶段进入）
          if (!isGameStarting && state.stage === GAME_STAGES.DEALING && state.players.every(p => p.hand && p.hand.length === 2)) {
            console.log('[联机游戏] 检测到游戏启动，开始发牌动画');
            setIsGameStarting(true);
            animateDealing(state.players.length);
            return; // 先不更新 gameState，等动画完成
          }

          setGameState(state);

          // 检测阶段变化
          if (prevStageRef.current && prevStageRef.current !== state.stage) {
            console.log('[联机游戏] 阶段切换:', prevStageRef.current, '→', state.stage);

            // 阶段切换时增加停顿，让玩家看清公共牌
            if (state.stage === GAME_STAGES.FLOP ||
                state.stage === GAME_STAGES.TURN ||
                state.stage === GAME_STAGES.RIVER) {
              playSound('flip', !soundEnabled);
            }
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

        // 订阅房间表情
        const unsubscribeEmojis = subscribeToEmojis(roomId, (emoji) => {
          // 显示飘浮表情动画
          const newEmoji = {
            id: Date.now() + Math.random(),
            ...emoji
          };
          setFloatingEmojis(prev => [...prev, newEmoji]);

          // 3秒后移除
          setTimeout(() => {
            setFloatingEmojis(prev => prev.filter(e => e.id !== newEmoji.id));
          }, 3000);
        });

        // 订阅房间聊天
        const unsubscribeChat = subscribeToChatMessages(roomId, (message) => {
          setChatMessages(prev => [...prev.slice(-49), message]); // 保留最近50条
        });

        return () => {
          if (unsubscribeEmojis) unsubscribeEmojis();
          if (unsubscribeChat) unsubscribeChat();
        };
      } catch (err) {
        console.error('[联机游戏] 初始化失败:', err);
        setError('游戏初始化失败: ' + err.message);
      }
    };

    loadRoom();

    // 连接状态检测：15秒无数据=重连中，30秒=断开
    lastUpdateTimeRef.current = Date.now();
    const connectionCheck = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastUpdateTimeRef.current;
      if (timeSinceLastUpdate > 30000) {
        setConnectionStatus('disconnected');
      } else if (timeSinceLastUpdate > 15000) {
        setConnectionStatus('reconnecting');
      } else {
        setConnectionStatus('connected');
      }
    }, 5000);

    return () => {
      clearInterval(connectionCheck);
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

  // 发牌动画
  const animateDealing = (playerCount) => {
    const totalCards = playerCount * 2;
    let dealt = 0;
    setDealingCards(0);
    setDealingComplete(false);

    const dealInterval = setInterval(() => {
      dealt++;
      setDealingCards(dealt);
      playSound('deal', !soundEnabled);
      if (dealt >= totalCards) {
        clearInterval(dealInterval);
        setTimeout(() => {
          setDealingCards(totalCards);
          setDealingComplete(true);
          setIsGameStarting(false);
          // 动画完成后更新状态，触发游戏继续
        }, 400);
      }
    }, 150);
  };

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

    // 摊牌时记录牌面快照
    let showdown = null;
    if (isShowdown) {
      showdown = {
        community: state.communityCards.map(c => c.id),
        players: state.players
          .filter(p => !p.folded)
          .map(p => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            hand: p.hand.map(c => c.id),
            handName: result.playerHands[p.id]?.name || '',
            isWinner: winnerIds.includes(p.id)
          }))
      };
    }

    // 记录本回合历史
    const roundRecord = {
      round: state.roundsPlayed,
      winners: result.winners,
      winnerNames,
      bestHand: result.bestHand || '',
      playerChips: state.players.map(p => ({ id: p.id, name: p.name, chips: p.chips })),
      showdown
    };

    setSessionHistory(prev => [...prev, roundRecord]);

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

    // 保存整局记录到用户历史
    if (gameState && sessionHistory.length > 0 && gameStartTime) {
      const myPlayer = gameState.players.find(p => p.id === user.userId);
      const initialChips = room?.settings?.initialChips || 1000;
      const duration = Math.floor((Date.now() - gameStartTime) / 1000);

      const gameRecord = {
        id: uuidv4(),
        playedAt: new Date().toISOString(),
        mode: 'online', // 标记为联机模式
        result: myPlayer.chips > initialChips ? 'win' : 'lose',
        playersCount: gameState.players.length,
        initialChips: initialChips,
        finalChips: myPlayer.chips,
        profit: myPlayer.chips - initialChips,
        roundsPlayed: sessionHistory.length,
        bestHand: sessionHistory.map(r => r.bestHand).filter(Boolean).pop() || '',
        durationSeconds: duration,
        roomId: roomId,
        // 摊牌回合快照（用于历史详情查看亮牌）
        showdowns: sessionHistory
          .filter(r => r.showdown)
          .map(r => ({
            round: r.round,
            community: r.showdown.community,
            players: r.showdown.players,
            winnerNames: r.winnerNames
          }))
      };

      addGameHistory(user.userId, gameRecord);
      console.log('[联机游戏] 游戏历史已保存:', gameRecord);
    }

    try {
      await leaveRoom(roomId, user.userId);
      onExit();
    } catch (err) {
      console.error('[联机游戏] 退出失败:', err);
      onExit();
    }
  };

  const handleSendEmoji = async (emojiId) => {
    try {
      await sendEmoji(roomId, user.userId, user.displayName, emojiId);
      setShowEmojiPicker(false);
    } catch (err) {
      console.error('[联机游戏] 发送表情失败:', err);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    try {
      await sendChatMessage(roomId, user.userId, user.displayName, chatInput);
      setChatInput('');
    } catch (err) {
      console.error('[联机游戏] 发送消息失败:', err);
      setError(err.message);
      setTimeout(() => setError(''), 3000);
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

        {/* 表情按钮 */}
        <button
          className="btn btn-icon emoji-btn"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          title="发送表情"
          style={{ marginLeft: '0.5rem' }}
        >
          😊
        </button>

        {/* 聊天按钮 */}
        <button
          className="btn btn-icon chat-btn"
          onClick={() => setShowChatBox(!showChatBox)}
          title="聊天"
          style={{ marginLeft: '0.5rem' }}
        >
          💬
        </button>

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

      {/* 表情选择器 */}
      {showEmojiPicker && (
        <div className="emoji-picker">
          {EMOJIS.map(emoji => (
            <button
              key={emoji.id}
              className="emoji-option"
              onClick={() => handleSendEmoji(emoji.id)}
              title={emoji.text}
            >
              <span className="emoji-icon">{emoji.emoji}</span>
              <span className="emoji-label">{emoji.text}</span>
            </button>
          ))}
        </div>
      )}

      {/* 飘浮表情动画 */}
      {floatingEmojis.map(emoji => (
        <div
          key={emoji.id}
          className="floating-emoji"
          style={{
            left: `${20 + Math.random() * 60}%`,
            animationDuration: `${2 + Math.random()}s`
          }}
        >
          <div className="floating-emoji-content">
            <span className="floating-emoji-icon">{emoji.emoji}</span>
            <span className="floating-emoji-text">{emoji.userName}: {emoji.text}</span>
          </div>
        </div>
      ))}

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
          <div
            className="settings-menu-item"
            onClick={() => { setShowHandGuide(true); setShowSettingsMenu(false); }}
          >
            <span className="settings-menu-icon">🃏</span>
            <span className="settings-menu-label">牌型说明</span>
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
        dealingCards={dealingCards}
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

      <div className="game-version">v2026.06.08-online</div>

      {/* 牌型说明弹窗 */}
      {showHandGuide && (
        <div className="hand-guide-overlay" onClick={() => setShowHandGuide(false)}>
          <div className="hand-guide-modal" onClick={e => e.stopPropagation()}>
            <div className="hand-guide-header">
              <h3>🃏 牌型大小（从大到小）</h3>
              <button className="hand-guide-close" onClick={() => setShowHandGuide(false)}>✕</button>
            </div>
            <div className="hand-guide-list">
              {[
                { rank: 1, name: '皇家同花顺', desc: 'A K Q J 10 同花色', example: '♠A ♠K ♠Q ♠J ♠10' },
                { rank: 2, name: '同花顺', desc: '五张连续同花色', example: '♥9 ♥8 ♥7 ♥6 ♥5' },
                { rank: 3, name: '四条', desc: '四张相同点数', example: '♠K ♥K ♦K ♣K ♠A' },
                { rank: 4, name: '葫芦', desc: '三条 + 一对', example: '♠Q ♥Q ♦Q ♣J ♠J' },
                { rank: 5, name: '同花', desc: '五张同花色', example: '♦A ♦J ♦8 ♦5 ♦2' },
                { rank: 6, name: '顺子', desc: '五张连续不同花', example: '♠9 ♥8 ♦7 ♣6 ♠5' },
                { rank: 7, name: '三条', desc: '三张相同点数', example: '♠7 ♥7 ♦7 ♣K ♠A' },
                { rank: 8, name: '两对', desc: '两个不同的对子', example: '♠A ♥A ♦K ♣K ♠Q' },
                { rank: 9, name: '一对', desc: '两张相同点数', example: '♠J ♥J ♦A ♣K ♠Q' },
                { rank: 10, name: '高牌', desc: '以最大单张比较', example: '♠A ♦K ♥J ♣8 ♠5' },
              ].map(h => (
                <div key={h.rank} className="hand-guide-row">
                  <span className="hand-guide-rank">#{h.rank}</span>
                  <span className="hand-guide-name">{h.name}</span>
                  <span className="hand-guide-desc">{h.desc}</span>
                  <span className="hand-guide-example">{h.example}</span>
                </div>
              ))}
            </div>
            <p className="hand-guide-tip">点击任意位置关闭</p>
          </div>
        </div>
      )}

      {/* 聊天框 */}
      {showChatBox && (
        <div className="chat-box">
          <div className="chat-header">
            <span>💬 聊天</span>
            <button className="chat-close" onClick={() => setShowChatBox(false)}>✕</button>
          </div>
          <div className="chat-messages">
            {chatMessages.length === 0 ? (
              <div className="chat-empty">暂无消息</div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div key={idx} className={`chat-message ${msg.userId === user.userId ? 'own' : ''}`}>
                  <span className="chat-user">{msg.userName}:</span>
                  <span className="chat-text">{msg.message}</span>
                </div>
              ))
            )}
          </div>
          <form className="chat-input-form" onSubmit={handleSendChat}>
            <input
              type="text"
              className="chat-input"
              placeholder="输入消息..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              maxLength={200}
              autoComplete="off"
            />
            <button type="submit" className="chat-send-btn" disabled={!chatInput.trim()}>
              发送
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default OnlineGame;
