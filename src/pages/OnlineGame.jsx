import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { OnlineGameEngine } from '../game/onlineEngine';
import { getRoom, leaveRoom } from '../services/roomService';
import { getFirebaseDB } from '../services/firebase';
import { ref, onValue, update, off, get } from 'firebase/database';
import { startHeartbeat, stopHeartbeat, isPlayerOnline } from '../services/heartbeatService';
import { EMOJIS, sendEmoji, subscribeToEmojis } from '../services/emojiService';
import { sendChatMessage, subscribeToChatMessages } from '../services/chatService';
import { describeCurrentHand } from '../game/handEval';
import { GAME_STAGES } from '../game/engine';
import { addGameHistory } from '../auth/userManager';
import { v4 as uuidv4 } from 'uuid';
import Table from '../ui/Table';
import ActionBar from '../ui/ActionBar';
import GameLog from '../ui/GameLog';
import RoundSummary from '../ui/RoundSummary';
import '../styles/round-summary.css';
import { playSound } from '../game/sound';

const OnlineGame = ({ roomId, user, onExit, stealthMode, onToggleStealth, soundEnabled, onToggleSound }) => {
  const [room, setRoom] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [actionBarVisible, setActionBarVisible] = useState(false);
  const [actionBarReady, setActionBarReady] = useState(false);
  const [stageChangeTime, setStageChangeTime] = useState(null); // 记录阶段切换时间
  const [dealingCompleteTime, setDealingCompleteTime] = useState(null); // 记录发牌完成时间
  const [gameLog, setGameLog] = useState([]);
  const [logCollapsed, setLogCollapsed] = useState(true); // 默认收起
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('connected');
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const [winnerHighlight, setWinnerHighlight] = useState(null);
  const [roundToast, setRoundToast] = useState(null);
  const [allInFlash, setAllInFlash] = useState(null);
  const [yourTurn, setYourTurn] = useState(false);
  const [showTurnNotice, setShowTurnNotice] = useState(false); // 花字提示
  const [thinkingAi, setThinkingAi] = useState(null);
  const [dealingCards, setDealingCards] = useState(undefined);
  const [dealingComplete, setDealingComplete] = useState(true); // 默认为true，避免阻塞ActionBar
  const [isGameStarting, setIsGameStarting] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [gameStartTime, setGameStartTime] = useState(null);
  const [showHandGuide, setShowHandGuide] = useState(false);
  const [showChatBox, setShowChatBox] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showRoundSummary, setShowRoundSummary] = useState(false);
  const [roundSummaryData, setRoundSummaryData] = useState(null);
  const [readyStatus, setReadyStatus] = useState({}); // 玩家准备状态 {userId: boolean}
  const [isReady, setIsReady] = useState(false); // 当前玩家是否准备
  const [offlinePlayerIds, setOfflinePlayerIds] = useState([]); // 离线玩家ID列表

  const engineRef = useRef(null);
  const isHost = room?.hostId === user.userId;
  const lastUpdateTimeRef = useRef(Date.now());
  const settingsRef = useRef(null);
  const buttonRef = useRef(null);
  const wasMyTurnRef = useRef(false);
  const prevStageRef = useRef(null);
  const lastGameLogLengthRef = useRef(0);
  const roundEndHandledRef = useRef(false); // 防止重复触发回合结束弹窗
  const prevCurrentPlayerIdRef = useRef(null); // 上一次的当前行动玩家ID
  const myTurnStartTimeRef = useRef(null); // 轮到我的时刻（用于决策弹窗延迟）
  const gameStateRef = useRef(null); // 最新游戏状态（供离线检测等回调读取，避免闭包陈旧）

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
            // 不要return，继续更新gameState
          }

          setGameState(state);
          gameStateRef.current = state;

          // 如果不在DEALING阶段，确保dealingComplete为true
          if (state.stage !== GAME_STAGES.DEALING && state.stage !== GAME_STAGES.WAITING) {
            setDealingComplete(true);
          }

          // 检测阶段变化
          if (prevStageRef.current && prevStageRef.current !== state.stage) {
            console.log('[联机游戏] 阶段切换:', prevStageRef.current, '→', state.stage);

            // 阶段切换时增加停顿，让玩家看清公共牌
            if (state.stage === GAME_STAGES.FLOP ||
                state.stage === GAME_STAGES.TURN ||
                state.stage === GAME_STAGES.RIVER) {
              playSound('flip', !soundEnabled);
              // 记录阶段切换时间，用于延迟显示决策界面
              setStageChangeTime(Date.now());
            }
          }
          prevStageRef.current = state.stage;

          // 检测获胜
          if (state.stage === GAME_STAGES.RESULT) {
            handleRoundEnd(state);
          } else if (state.stage === GAME_STAGES.DEALING || state.stage === GAME_STAGES.PRE_FLOP) {
            // 新一轮开始，关闭回合小结弹窗（所有客户端，包括非房主）
            if (roundEndHandledRef.current) {
              console.log('[联机游戏] 检测到新一轮开始，关闭回合小结');
              roundEndHandledRef.current = false;
              setShowRoundSummary(false);
              setRoundSummaryData(null);
              setReadyStatus({});
              setIsReady(false);
              setWinnerHighlight(null);
            }
          }

          // 检测 AI 思考状态
          const currentPlayer = state.players[state.currentPlayerIndex];
          if (currentPlayer && !currentPlayer.isHuman && !currentPlayer.folded && !currentPlayer.allIn) {
            setThinkingAi(currentPlayer.id);
          } else {
            setThinkingAi(null);
          }

          // 检测"当前行动玩家"变化：当从别人切换到我时，记录时刻用于决策弹窗延迟
          const currentPlayerId = currentPlayer?.id || null;
          if (currentPlayerId !== prevCurrentPlayerIdRef.current) {
            // 行动玩家发生了变化
            if (currentPlayerId === user.userId &&
                prevCurrentPlayerIdRef.current !== null &&
                prevCurrentPlayerIdRef.current !== user.userId) {
              // 从"前置玩家"切换到"我"，记录时刻
              myTurnStartTimeRef.current = Date.now();
            }
            prevCurrentPlayerIdRef.current = currentPlayerId;
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

    // 使用 Firebase 内置的 .info/connected 检测真实连接状态
    // 这比依赖游戏状态更新频率更可靠（游戏空闲时也不会误报断线）
    const db = getFirebaseDB();
    const connectedRef = ref(db, '.info/connected');
    let reconnectTimer = null;

    const connListener = onValue(connectedRef, (snap) => {
      const isConnected = snap.val() === true;
      if (isConnected) {
        // 已连接，清除重连计时器
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        setConnectionStatus('connected');
      } else {
        // 断开连接：先显示"重连中"，10秒后仍未恢复则显示"已断开"
        setConnectionStatus('reconnecting');
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          setConnectionStatus('disconnected');
        }, 10000);
      }
    });

    return () => {
      off(connectedRef, 'value', connListener);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (unsubscribe) {
        unsubscribe();
      }
      stopHeartbeat();
      if (engineRef.current) {
        engineRef.current.cleanup();
      }
    };
  }, [roomId, user.userId]);

  // 监听准备状态
  useEffect(() => {
    if (!roomId || !showRoundSummary) return;

    const db = getFirebaseDB();
    const readyRef = ref(db, `rooms/${roomId}/roundReady`);

    const listener = onValue(readyRef, (snapshot) => {
      const ready = snapshot.val() || {};
      setReadyStatus(ready);

      // 检查是否所有玩家都准备好
      if (gameState && gameState.players) {
        const allReady = gameState.players.every(p => ready[p.id] === true);

        if (allReady && isHost) {
          // 所有人准备好，房主触发下一轮
          console.log('[联机游戏] 所有玩家准备完毕，开始下一轮');
          setShowRoundSummary(false);
          setRoundSummaryData(null);
          setReadyStatus({});
          setIsReady(false);
          setWinnerHighlight(null);

          // 房主触发下一轮
          setTimeout(() => {
            if (engineRef.current) {
              engineRef.current.engine.startNewRound();
              const newState = engineRef.current.engine.getGameState();
              engineRef.current.pushGameState(newState);
            }
          }, 500);
        }
      }
    });

    return () => off(readyRef, 'value', listener);
  }, [roomId, showRoundSummary, gameState, isHost]);

  // 监听房间玩家心跳，实时计算离线状态（所有玩家可见，不依赖"轮到谁行动"）
  useEffect(() => {
    if (!roomId) return;

    const db = getFirebaseDB();
    const playersRef = ref(db, `rooms/${roomId}/players`);
    let roomPlayersCache = {};

    // 根据缓存的玩家数据重新计算离线列表
    // 离线 = 游戏中的真人玩家，在房间players中已不存在（已退出）或心跳超时（掉线）
    const recomputeOffline = () => {
      const gs = gameStateRef.current;
      if (!gs || !gs.players) return;

      const offline = [];
      gs.players.forEach(gp => {
        // 机器人永远在线
        if (gp.isBot || !gp.isHuman) return;
        // 自己不标记离线
        if (gp.id === user.userId) return;

        const roomPlayer = roomPlayersCache[gp.id];
        // 房间中已无此玩家（主动退出）或心跳超时（掉线）
        if (!roomPlayer || !isPlayerOnline(roomPlayer)) {
          offline.push(gp.id);
        }
      });

      setOfflinePlayerIds(prev => {
        // 避免无变化时触发重渲染
        if (prev.length === offline.length && prev.every(id => offline.includes(id))) {
          return prev;
        }
        return offline;
      });
    };

    const listener = onValue(playersRef, (snapshot) => {
      roomPlayersCache = snapshot.val() || {};
      recomputeOffline();
    });

    // 每5秒重新检查一次心跳（即使没有数据变化，心跳过期也要能检测到）
    const interval = setInterval(recomputeOffline, 5000);

    return () => {
      off(playersRef, 'value', listener);
      clearInterval(interval);
    };
  }, [roomId]);

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

      // 显示花字提示
      setShowTurnNotice(true);
      setTimeout(() => {
        setShowTurnNotice(false);
      }, 2000); // 2秒后淡出
    } else if (!isMyTurn && yourTurn) {
      setYourTurn(false);
    }

    wasMyTurnRef.current = isMyTurn;
  }, [gameState, roundToast, soundEnabled, user.userId, yourTurn]);

  // 监听gameLog变化，播放AI玩家动作音效
  useEffect(() => {
    if (!gameState || !gameState.gameLog) return;

    const currentLogLength = gameState.gameLog.length;

    // 首次加载或日志重置（新回合）时，只记录长度不播放音效
    if (lastGameLogLengthRef.current === 0 || currentLogLength < lastGameLogLengthRef.current) {
      lastGameLogLengthRef.current = currentLogLength;
      return;
    }

    // 检测到新的日志条目
    if (currentLogLength > lastGameLogLengthRef.current) {
      const newLogs = gameState.gameLog.slice(0, currentLogLength - lastGameLogLengthRef.current);

      // 遍历新日志，播放对应音效
      newLogs.forEach(log => {
        // 跳过自己的动作（已在handleAction中播放）
        const isMyAction = gameState.players.find(p => p.id === user.userId && p.name === log.player);
        if (isMyAction) return;

        // 根据日志消息判断动作类型
        const message = log.message.toLowerCase();
        if (message.includes('弃牌') || message.includes('fold')) {
          playSound('fold', !soundEnabled);
        } else if (message.includes('过牌') || message.includes('check')) {
          playSound('check', !soundEnabled);
        } else if (message.includes('跟注') || message.includes('call') ||
                   message.includes('加注') || message.includes('raise') ||
                   message.includes('下注') || message.includes('bet')) {
          playSound('chip', !soundEnabled);
        }

        // 检测全押：日志中包含"全押"或找到对应玩家且allIn为true
        if (message.includes('全押') || message.includes('all-in') || message.includes('allin')) {
          const player = gameState.players.find(p => p.name === log.player);
          if (player && player.allIn) {
            playSound('allin', !soundEnabled);
            setAllInFlash(player.name);
            setTimeout(() => setAllInFlash(null), 1400);
          }
        }
      });

      lastGameLogLengthRef.current = currentLogLength;
    }
  }, [gameState, soundEnabled, user.userId]);

  // 发牌动画
  const animateDealing = (playerCount) => {
    const totalCards = playerCount * 2;
    let dealt = 0;
    setDealingCards(1); // 从1开始，避免0被误认为是有效值
    setDealingComplete(false);

    const dealInterval = setInterval(() => {
      dealt++;
      setDealingCards(dealt);
      playSound('deal', !soundEnabled);
      if (dealt >= totalCards) {
        clearInterval(dealInterval);
        setTimeout(() => {
          setDealingComplete(true);
          setIsGameStarting(false);
          setDealingCompleteTime(Date.now()); // 记录发牌完成时间
          // 动画完成后重置dealingCards，让Table显示实际手牌
          setDealingCards(undefined);
        }, 400);
      }
    }, 150);
  };

  const updateActionBarVisibility = (state) => {
    if (!state || !state.players || state.players.length === 0) {
      console.warn('[联机游戏] updateActionBarVisibility: 状态无效', state);
      return;
    }

    // 摊牌/结算阶段不显示操作栏
    if (state.stage === GAME_STAGES.RESULT || state.stage === GAME_STAGES.SHOWDOWN) {
      setActionBarVisible(false);
      setActionBarReady(false);
      return;
    }

    const currentPlayer = state.players[state.currentPlayerIndex];
    if (!currentPlayer) {
      console.warn('[联机游戏] 当前玩家不存在', {
        currentPlayerIndex: state.currentPlayerIndex,
        playersLength: state.players.length
      });
      return;
    }

    const isMyTurn = currentPlayer.id === user.userId;
    const canAct = isMyTurn &&
                   !currentPlayer.folded &&
                   !currentPlayer.allIn &&
                   currentPlayer.chips > 0; // 筹码为0不能操作

    console.log('[联机游戏] ActionBar 可见性检查:', {
      isMyTurn,
      canAct,
      currentPlayer: currentPlayer.name,
      folded: currentPlayer.folded,
      allIn: currentPlayer.allIn,
      chips: currentPlayer.chips,
      stage: state.stage
    });

    if (canAct) {
      // 计算延迟：人性化等待时间
      let delay = 600;

      // 检查阶段切换延迟（翻牌/转牌/河牌后停顿2s）
      if (stageChangeTime) {
        const timeSinceStageChange = Date.now() - stageChangeTime;
        if (timeSinceStageChange < 2000) {
          delay = Math.max(delay, 2000 - timeSinceStageChange);
        }
      }

      // 检查发牌完成延迟（2秒）
      if (dealingCompleteTime) {
        const timeSinceDealingComplete = Date.now() - dealingCompleteTime;
        if (timeSinceDealingComplete < 2000) {
          delay = Math.max(delay, 2000 - timeSinceDealingComplete);
        }
      }

      // 检查"前置玩家做完决策后轮到我"的延迟（停顿2s）
      if (myTurnStartTimeRef.current) {
        const timeSinceMyTurn = Date.now() - myTurnStartTimeRef.current;
        if (timeSinceMyTurn < 2000) {
          delay = Math.max(delay, 2000 - timeSinceMyTurn);
        }
      }

      setActionBarVisible(true);
      setActionBarReady(false);
      setTimeout(() => {
        setActionBarReady(true);
      }, delay);
    } else {
      setActionBarVisible(false);
      setActionBarReady(false);
    }
  };

  const handleRoundEnd = (state) => {
    // 防止重复触发
    if (roundEndHandledRef.current) return;
    roundEndHandledRef.current = true;

    // 从 lastShowdownResult 或构造获胜结果
    const result = engineRef.current?.engine?.lastShowdownResult;

    if (!result) {
      // 没有摊牌数据，说明是弃牌结束
      const activePlayers = state.players.filter(p => !p.folded);
      if (activePlayers.length >= 1) {
        const winner = activePlayers[0];
        displayRoundSummary({
          winners: { [winner.id]: state.pot },
          playerHands: {},
          bestHand: ''
        }, state);
      }
      return;
    }

    displayRoundSummary(result, state);
  };

  const displayRoundSummary = async (result, state) => {
    const winnerIds = Object.keys(result.winners);

    setWinnerHighlight(winnerIds);

    // 播放胜负音效
    const iWon = winnerIds.includes(user.userId);
    playSound(iWon ? 'win' : 'lose', !soundEnabled);

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
      winnerNames: winnerIds.map(id => state.players.find(p => p.id === id)?.name).filter(Boolean),
      bestHand: result.bestHand || '',
      playerChips: state.players.map(p => ({ id: p.id, name: p.name, chips: p.chips })),
      showdown
    };

    setSessionHistory(prev => [...prev, roundRecord]);

    // 显示回合结束弹窗
    setRoundSummaryData({
      players: state.players,
      result: result,
      initialChips: room?.settings?.initialChips || 1000
    });
    setShowRoundSummary(true);
    setIsReady(true); // 默认已准备，显示"取消准备"按钮

    // 房主初始化准备状态
    if (isHost) {
      const db = getFirebaseDB();
      const readyRef = ref(db, `rooms/${roomId}/roundReady`);
      const initialReady = {};

      // 获取房间玩家在线状态
      const roomPlayersRef = ref(db, `rooms/${roomId}/players`);
      const roomPlayersSnapshot = await get(roomPlayersRef);
      const roomPlayers = roomPlayersSnapshot.val() || {};

      state.players.forEach(p => {
        const roomPlayer = roomPlayers[p.id];
        // 机器人和在线真人自动准备
        if (p.isBot || (roomPlayer && roomPlayer.isOnline)) {
          initialReady[p.id] = true;
        } else {
          initialReady[p.id] = false;
        }
      });

      // 使用set而不是update，确保完全替换
      await update(readyRef, initialReady);

      console.log('[联机游戏] 房主初始化准备状态:', initialReady);
    }
    // 非房主不需要做任何事，等待房主初始化
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
    const myPlayer = gameState?.players?.find(p => p.id === user.userId);
    const initialChips = room?.settings?.initialChips || 1000;
    const chipStatus = myPlayer
      ? myPlayer.chips > initialChips
        ? `当前盈利 +${myPlayer.chips - initialChips}`
        : myPlayer.chips < initialChips
        ? `当前亏损 ${myPlayer.chips - initialChips}`
        : '当前持平'
      : '';

    const message = chipStatus
      ? `确定要退出游戏吗？${chipStatus}，退出后无法恢复。`
      : '确定要退出游戏吗？';

    if (!confirm(message)) {
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

  const handleReady = async () => {
    try {
      const db = getFirebaseDB();
      const readyRef = ref(db, `rooms/${roomId}/roundReady/${user.userId}`);
      await update(readyRef.parent, { [user.userId]: true });
      setIsReady(true);
    } catch (err) {
      console.error('[联机游戏] 标记准备失败:', err);
    }
  };

  const handleUnready = async () => {
    try {
      const db = getFirebaseDB();
      const readyRef = ref(db, `rooms/${roomId}/roundReady/${user.userId}`);
      await update(readyRef.parent, { [user.userId]: false });
      setIsReady(false);
    } catch (err) {
      console.error('[联机游戏] 取消准备失败:', err);
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

  // 合并离线标记到游戏状态，供 Table/PlayerSeat 显示"已离线"角标
  const gameStateWithOffline = {
    ...gameState,
    players: gameState.players.map(p => ({
      ...p,
      isOffline: offlinePlayerIds.includes(p.id)
    }))
  };

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
      </div>

      {/* 右上角操作按钮组 */}
      <div className="top-right-controls">
        {/* 表情按钮 */}
        <button
          className="btn btn-icon emoji-btn"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          title="发送表情"
        >
          😊
        </button>

        {/* 聊天按钮 */}
        <button
          className="btn btn-icon chat-btn"
          onClick={() => setShowChatBox(!showChatBox)}
          title="聊天"
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

      {/* 轮到你下注的花字提示 */}
      {showTurnNotice && (
        <div className="your-turn-notice">
          轮到您下注
        </div>
      )}

      <Table
        gameState={gameStateWithOffline}
        aiStatus={{}}
        userSettings={{ userId: user.userId }}
        thinkingAi={thinkingAi}
        totalPlayers={gameState.players.length}
        winnerHighlight={winnerHighlight}
        dealingCards={dealingCards}
        stealthMode={stealthMode}
        allInFlash={allInFlash}
      />

      {actionBarVisible && actionBarReady && dealingComplete && (
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
                  <span className="hand-guide-example">
                    {h.example.split(' ').map((card, i) => {
                      const suit = card[0];
                      let color = '#2c3e50'; // 默认黑色
                      if (suit === '♠') color = '#34495e';      // 黑桃：深灰色
                      else if (suit === '♥') color = '#e74c3c'; // 红桃：红色
                      else if (suit === '♦') color = '#3498db'; // 方块：蓝色
                      else if (suit === '♣') color = '#27ae60'; // 梅花：绿色
                      return (
                        <span key={i} style={{ color, marginRight: '0.3rem', fontWeight: '600' }}>
                          {card}
                        </span>
                      );
                    })}
                  </span>
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

      {/* 回合结束弹窗 */}
      {showRoundSummary && roundSummaryData && (
        <RoundSummary
          players={roundSummaryData.players}
          result={roundSummaryData.result}
          initialChips={roundSummaryData.initialChips}
          onReady={handleReady}
          onUnready={handleUnready}
          isReady={isReady}
          readyStatus={readyStatus}
          isOnlineMode={true}
          onExit={handleExit}
        />
      )}
    </div>
  );
};

export default OnlineGame;
