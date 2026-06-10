import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { GameEngine, GAME_STAGES } from '../game/engine';
import { getShuffledAIPlayers } from '../ai/personalities';
import { localAIDecide } from '../ai/localPlayer';
import { llmAIDecide } from '../ai/llmPlayer';
import { describeCurrentHand, estimateHandStrength } from '../game/handEval';
import { refreshSessionUser } from '../auth/session';
import { addGameHistory } from '../auth/userManager';
import { debugLog } from '../game/debugLog';
import { playSound } from '../game/sound';
import Table from '../ui/Table';
import ActionBar from '../ui/ActionBar';
import GameLog from '../ui/GameLog';
import RoundSummary from '../ui/RoundSummary';
import '../styles/round-summary.css';
import { v4 as uuidv4 } from 'uuid';

const Game = ({ playerCount, onBack, stealthMode, onToggleStealth, soundEnabled, onToggleSound }) => {
  const [game, setGame] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [logCollapsed, setLogCollapsed] = useState(true); // 默认收起
  const [user, setUser] = useState(null);
  const [aiStatus, setAiStatus] = useState({});
  const [thinkingAi, setThinkingAi] = useState(null);
  const [actionHistory, setActionHistory] = useState([]);
  const [winnerHighlight, setWinnerHighlight] = useState(null);
  const [showChipsModal, setShowChipsModal] = useState(false);
  const [roundToast, setRoundToast] = useState(null);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [showSettlement, setShowSettlement] = useState(false);
  const [showVictory, setShowVictory] = useState(false); // 全员淘汰胜利
  const [expandedRound, setExpandedRound] = useState(null);
  const [dealingCards, setDealingCards] = useState(0); // 已发出的牌数（动画用）
  const [dealingComplete, setDealingComplete] = useState(false); // 发牌是否完成
  const [actionBarReady, setActionBarReady] = useState(false); // ActionBar 是否准备好显示（用于连续决策间隔）
  const [allInFlash, setAllInFlash] = useState(null); // ALL IN 戏剧效果（玩家名）
  const [yourTurn, setYourTurn] = useState(false); // 是否轮到人类玩家（用于提示）
  const [showTurnNotice, setShowTurnNotice] = useState(false); // 轮到你下注的花字闪现
  const [showSettingsMenu, setShowSettingsMenu] = useState(false); // 设置下拉菜单
  const [showHandGuide, setShowHandGuide] = useState(false); // 牌型说明弹窗
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 }); // 下拉菜单位置
  const [showRoundSummary, setShowRoundSummary] = useState(false); // 回合结束弹窗
  const [roundSummaryData, setRoundSummaryData] = useState(null); // 回合结束数据
  const countdownRef = React.useRef(null);
  const gameRef = React.useRef(null); // 始终指向当前引擎实例，避免 state 闭包陷阱
  const wasHumanTurnRef = React.useRef(false); // 追踪上一次是否人类回合
  const settingsRef = useRef(null); // 设置下拉菜单引用
  const buttonRef = useRef(null); // 设置按钮引用

  useEffect(() => {
    const currentUser = refreshSessionUser();
    setUser(currentUser);

    if (currentUser) {
      initGame(currentUser);
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

  // 检测"刚轮到人类玩家"的瞬间：提示音 + 视觉脉冲
  useEffect(() => {
    const game = gameRef.current;
    let isHumanTurn = false;
    if (game && gameState &&
        gameState.stage !== GAME_STAGES.WAITING &&
        gameState.stage !== GAME_STAGES.DEALING &&
        gameState.stage !== GAME_STAGES.RESULT &&
        !roundToast) {
      const cp = game.getCurrentPlayer();
      isHumanTurn = cp && cp.isHuman && !cp.folded;
    }

    if (isHumanTurn && !wasHumanTurnRef.current) {
      // 刚转入人类回合
      setYourTurn(true);
      playSound('yourturn', !soundEnabled);

      // 显示居中花字提示（与联机模式对齐）
      setShowTurnNotice(true);
      setTimeout(() => {
        setShowTurnNotice(false);
      }, 2000); // 2秒后淡出
    } else if (!isHumanTurn && yourTurn) {
      setYourTurn(false);
    }
    wasHumanTurnRef.current = isHumanTurn;
  }, [gameState, roundToast, stealthMode]);

  const initGame = (currentUser) => {
    const players = [];

    players.push({
      id: 'human',
      name: currentUser.displayName,
      avatar: currentUser.avatar,
      isHuman: true
    });

    // 随机打乱 AI 性格并分配给 AI 玩家
    const aiPlayers = getShuffledAIPlayers(playerCount - 1);
    for (let i = 0; i < aiPlayers.length; i++) {
      const ai = aiPlayers[i];
      players.push({
        id: ai.id,
        name: ai.name,
        avatar: ai.avatar,
        style: ai.style,
        isHuman: false
      });
    }

    const newGame = new GameEngine();
    newGame.initGame(players, currentUser.settings);
    gameRef.current = newGame;
    setGame(newGame);
    setGameState(newGame.getGameState());
    setActionHistory([]);

    setTimeout(() => {
      newGame.dealInitialCards();
      setGameState(newGame.getGameState());
      // 发牌动画：逐张显示
      animateDealing(newGame, currentUser.settings);
    }, 500);
  };

  const animateDealing = (currentGame, userSettings) => {
    const totalCards = currentGame.players.length * 2;
    let dealt = 0;
    setDealingCards(0);
    setDealingComplete(false); // 开始发牌时重置状态

    const dealInterval = setInterval(() => {
      dealt++;
      setDealingCards(dealt);
      playSound('deal', !soundEnabled);
      if (dealt >= totalCards) {
        clearInterval(dealInterval);
        // 发牌完成，开始游戏
        setTimeout(() => {
          setDealingComplete(true); // 标记发牌完成
          // 动画完成后重置dealingCards，让Table显示实际手牌
          setDealingCards(undefined);

          // 检查是否人类玩家第一个决策，如果是则额外停顿2秒让玩家看牌
          const firstPlayer = currentGame.getCurrentPlayer();
          const isHumanFirst = firstPlayer && firstPlayer.isHuman && !firstPlayer.folded;
          const extraDelay = isHumanFirst ? 2000 : 0;

          setTimeout(() => {
            processTurn(currentGame, userSettings);
          }, extraDelay);
        }, 400);
      }
    }, 150); // 从 200ms 改为 150ms，让发牌更流畅
  };

  // 根据动作播放对应音效
  const playActionSound = (action) => {
    if (action === 'fold') playSound('fold', !soundEnabled);
    else if (action === 'check') playSound('check', !soundEnabled);
    else playSound('chip', !soundEnabled); // call / raise
  };

  // 检测某玩家是否刚刚 all-in，触发全屏戏剧效果
  const checkAllInDrama = (currentGame, playerId) => {
    const player = currentGame.players.find(p => p.id === playerId);
    if (player && player.allIn) {
      playSound('allin', !soundEnabled);
      setAllInFlash(player.name);
      setTimeout(() => setAllInFlash(null), 1400);
    }
  };

  const processTurn = useCallback((currentGame, userSettings) => {
    const state = currentGame.getGameState();

    if (state.stage === GAME_STAGES.RESULT) {
      setThinkingAi(null);
      if (currentGame.lastShowdownResult) {
        const result = currentGame.lastShowdownResult;
        currentGame.lastShowdownResult = null;
        setGameState({ ...currentGame.getGameState() });
        setTimeout(() => {
          finishRound(currentGame, result);
        }, 1500);
      } else {
        const activePlayers = state.players.filter(p => !p.folded);
        const winner = activePlayers[0];
        const result = {
          winners: winner ? { [winner.id]: state.pot } : {},
          playerHands: {},
          bestHand: ''
        };
        setTimeout(() => {
          finishRound(currentGame, result);
        }, 500);
      }
      return;
    }

    const activePlayers = state.players.filter(p => !p.folded);
    if (activePlayers.length === 1) {
      currentGame.endHand(activePlayers[0]);
      const finalState = currentGame.getGameState();
      setGameState({ ...finalState });
      setThinkingAi(null);
      const result = {
        winners: { [activePlayers[0].id]: finalState.pot },
        playerHands: {},
        bestHand: ''
      };
      setTimeout(() => {
        finishRound(currentGame, result);
      }, 500);
      return;
    }

    const allInPlayers = activePlayers.filter(p => p.allIn);
    if (allInPlayers.length === activePlayers.length && activePlayers.length > 1) {
      const quickDealToShowdown = () => {
        currentGame.nextStage();
        const newState = currentGame.getGameState();
        setGameState({ ...newState });

        if (newState.stage === GAME_STAGES.RESULT) {
          setThinkingAi(null);
          const result = currentGame.lastShowdownResult;
          currentGame.lastShowdownResult = null;
          setTimeout(() => {
            finishRound(currentGame, result);
          }, 1500);
        } else {
          setTimeout(quickDealToShowdown, 400);
        }
      };
      quickDealToShowdown();
      return;
    }

    const currentPlayer = currentGame.getCurrentPlayer();

    if (currentPlayer.folded) {
      currentGame.nextPlayer();
      const newState = currentGame.getGameState();
      setGameState({ ...newState });
      processTurn(currentGame, userSettings);
      return;
    }

    if (currentPlayer.isHuman) {
      setThinkingAi(null);
      // 短暂延迟后显示 ActionBar，避免连续决策时无间隔
      setActionBarReady(false);
      setTimeout(() => {
        setActionBarReady(true);
      }, 600);
      return;
    }

    setThinkingAi(currentPlayer.id);

    const toCall = currentGame.getAmountToCall(currentPlayer);
    const foldedPlayersList = state.players.filter(p => p.folded);
    const playerBetsList = state.players.map(p => ({
      name: p.name,
      bet: p.bet,
      chips: p.chips,
      folded: p.folded
    }));

    // 计算当前玩家相对于庄家的位置
    const currentPlayerIndex = state.currentPlayerIndex;
    const dealerIdx = state.dealerIndex;
    const relativePosition = (currentPlayerIndex - dealerIdx + state.players.length) % state.players.length;
    let positionName = 'middle';
    if (relativePosition === 1) positionName = 'SB';
    else if (relativePosition === 2) positionName = 'BB';
    else if (relativePosition === state.players.length - 1) positionName = 'BTN-1';
    else if (relativePosition === 0) positionName = 'BTN';

    const aiDecision = {
      hand: currentPlayer.hand,
      community: state.communityCards,
      toCall,
      pot: state.pot,
      stack: currentPlayer.chips,
      bet: currentPlayer.bet,
      style: currentPlayer.style,
      name: currentPlayer.name,
      stage: state.stage,
      position: positionName,
      actionHistory: [...actionHistory],
      activePlayers: activePlayers.length,
      totalPlayers: playerCount,
      playerBets: playerBetsList,
      foldedPlayers: foldedPlayersList,
      dealerIndex: dealerIdx,
      currentPlayerIndex,
      players: state.players, // 传递完整玩家信息
      settings: userSettings
    };

    const humanPlayer = state.players.find(p => p.isHuman);
    const humanFolded = humanPlayer && humanPlayer.folded;

    // 拟人化思考时间：中等牌力 + 面对下注时最纠结（想得久），强牌/烂牌决策清晰（快）
    let thinkTime;
    if (humanFolded) {
      thinkTime = 800 + Math.random() * 600; // 人类已弃牌，AI 之间也保持适当节奏
    } else {
      const strength = estimateHandStrength(currentPlayer.hand, state.communityCards); // 0~1
      // 决策难度：牌力越接近 0.5 越纠结（钟形），面对跟注压力进一步加时
      const ambiguity = 1 - Math.abs(strength - 0.5) * 2; // 0(清晰)~1(最纠结)
      const facingBet = toCall > 0 ? 1 : 0.5;
      const base = 700;
      const span = 1600 * ambiguity * facingBet;
      thinkTime = base + span + Math.random() * 400;
    }

    setTimeout(async () => {
      // 延迟后重新检查：当前玩家是否还是这个 AI（防止延迟期间用户已操作，轮次已变）
      const nowPlayer = gameRef.current.getCurrentPlayer();
      if (!nowPlayer || nowPlayer.id !== currentPlayer.id || nowPlayer.folded) {
        debugLog.add('AI_DECISION_CANCEL', `延迟后轮次已变 (预期 ${currentPlayer.name}, 实际 ${nowPlayer?.name || 'null'})`);
        return;
      }

      const prevStage = currentGame.stage; // 记录执行前的阶段
      let decision;
      const aiStartTime = Date.now();
      debugLog.aiDecisionStart(currentPlayer.name, aiDecision);

      try {
        if (humanFolded) {
          decision = localAIDecide({ hand: currentPlayer.hand, community: state.communityCards, toCall, pot: state.pot, stack: currentPlayer.chips, bet: currentPlayer.bet, style: currentPlayer.style });
          decision.aiType = 'local';
        } else {
          decision = await llmAIDecide(aiDecision);
        }
      } catch (err) {
        debugLog.aiDecisionError(currentPlayer.name, err);
        decision = localAIDecide({ hand: currentPlayer.hand, community: state.communityCards, toCall, pot: state.pot, stack: currentPlayer.chips, bet: currentPlayer.bet, style: currentPlayer.style });
        decision.aiType = 'local';
      }

      debugLog.aiDecisionResult(currentPlayer.name, decision, decision.aiType, Date.now() - aiStartTime);

      setAiStatus(prev => ({
        ...prev,
        [currentPlayer.id]: decision.aiType
      }));

      setActionHistory(prev => [
        ...prev,
        `${currentPlayer.name}: ${decision.action}(${decision.amount})`
      ]);

      currentGame.executeAction(decision.action, decision.amount);
      playActionSound(decision.action);
      checkAllInDrama(currentGame, currentPlayer.id);
      const newState = currentGame.getGameState();
      setGameState({ ...newState });

      if (newState.stage === GAME_STAGES.RESULT) {
        setThinkingAi(null);
        if (currentGame.lastShowdownResult) {
          const result = currentGame.lastShowdownResult;
          currentGame.lastShowdownResult = null;
          setTimeout(() => {
            finishRound(currentGame, result);
          }, 2000);
        } else {
          const activePlayers = newState.players.filter(p => !p.folded);
          const winner = activePlayers[0];
          const result = {
            winners: winner ? { [winner.id]: newState.pot } : {},
            playerHands: {},
            bestHand: ''
          };
          setTimeout(() => {
            finishRound(currentGame, result);
          }, 500);
        }
      } else {
        // 检测阶段切换（PRE_FLOP→FLOP, FLOP→TURN, TURN→RIVER）
        const stageChanged = prevStage !== newState.stage;
        const stageDelay = stageChanged ? 800 : 0; // 阶段切换时短暂停顿，让玩家看清公共牌

        setTimeout(() => {
          processTurn(currentGame, userSettings);
        }, stageDelay);
      }
    }, thinkTime);
  }, [playerCount, actionHistory]);

  const handleAction = (action, amount = 0) => {
    const game = gameRef.current;
    if (!game) return;
    const currentUser = refreshSessionUser();
    if (!currentUser) return;

    const currentPlayer = game.getCurrentPlayer();
    const prevStage = game.stage; // 记录执行前的阶段

    setActionHistory(prev => [
      ...prev,
      `${currentPlayer.name}: ${action}(${amount})`
    ]);

    game.executeAction(action, amount);
    playActionSound(action);
    checkAllInDrama(game, currentPlayer.id);
    const newState = game.getGameState();

    // 先重置 actionBarReady，避免 setGameState 触发 effect 时操作栏短暂显示（闪烁）
    setActionBarReady(false);
    setGameState({ ...newState });

    if (newState.stage === GAME_STAGES.RESULT) {
      if (game.lastShowdownResult) {
        const result = game.lastShowdownResult;
        game.lastShowdownResult = null;
        setTimeout(() => {
          finishRound(game, result);
        }, 2000);
      } else {
        const activePlayers = newState.players.filter(p => !p.folded);
        const winner = activePlayers[0];
        const result = {
          winners: winner ? { [winner.id]: newState.pot } : {},
          playerHands: {},
          bestHand: ''
        };
        setTimeout(() => {
          finishRound(game, result);
        }, 500);
      }
    } else {
      // 检测阶段切换（PRE_FLOP→FLOP, FLOP→TURN, TURN→RIVER）
      const stageChanged = prevStage !== newState.stage;
      const stageDelay = stageChanged ? 800 : 0; // 阶段切换时短暂停顿，让玩家看清公共牌

      setTimeout(() => {
        processTurn(game, currentUser.settings);
      }, stageDelay);
    }
  };

  // 每回合结束 - 轻量 toast + 记录历史 + 自动下一局
  const finishRound = (currentGame, result) => {
    const currentUser = refreshSessionUser();
    if (!currentUser) return;

    const winnerIds = Object.keys(result.winners);
    const winnerNames = winnerIds.map(id => currentGame.players.find(p => p.id === id)?.name).filter(Boolean);

    // 是否摊牌（有手牌评估数据）
    const isShowdown = result.playerHands && Object.keys(result.playerHands).length > 0;

    // 摊牌时记录牌面快照（公共牌 + 未弃牌玩家的手牌与牌型）
    let showdown = null;
    if (isShowdown) {
      showdown = {
        community: currentGame.communityCards.map(c => c.id),
        players: currentGame.players
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

    // 记录本回合各玩家收支
    const roundRecord = {
      round: currentGame.roundsPlayed,
      winners: result.winners,
      winnerNames,
      bestHand: result.bestHand || '',
      playerChips: currentGame.players.map(p => ({ id: p.id, name: p.name, chips: p.chips })),
      showdown
    };

    setSessionHistory(prev => [...prev, roundRecord]);
    setWinnerHighlight(winnerIds);

    // 播放胜负音效
    const humanWon = winnerIds.includes('human');
    playSound(humanWon ? 'win' : 'lose', !soundEnabled);

    debugLog.finishGameResult(roundRecord);

    // 显示回合结束弹窗
    setRoundSummaryData({
      players: currentGame.players,
      result: result,
      initialChips: currentUser.settings.initialChips,
      communityCards: currentGame.communityCards || []
    });
    setShowRoundSummary(true);

    // 5秒后自动关闭弹窗并开始下一轮
    countdownRef.current = setTimeout(() => {
      countdownRef.current = null;
      setShowRoundSummary(false);
      setRoundSummaryData(null);
      setWinnerHighlight(null);
      startNewHand();
    }, 5000);
  };

  const startNewHand = () => {
    const currentGame = gameRef.current;
    if (!currentGame) return;
    const currentUser = refreshSessionUser();
    if (!currentUser) return;

    if (countdownRef.current) {
      clearTimeout(countdownRef.current);
      countdownRef.current = null;
    }

    const humanPlayer = currentGame.players.find(p => p.isHuman);
    if (humanPlayer && humanPlayer.chips <= 0) {
      setShowChipsModal(true);
      setRoundToast(null);
      setWinnerHighlight(null);
      return;
    }

    // 剔除破产的 AI 玩家
    currentGame.players = currentGame.players.filter(p => p.chips > 0);

    // 如果只剩人类玩家，触发胜利
    if (currentGame.players.length <= 1) {
      playSound('win', !soundEnabled);
      setShowVictory(true);
      return;
    }

    setRoundToast(null);
    setWinnerHighlight(null);
    setAiStatus({});
    setActionHistory([]);

    const tableEl = document.querySelector('.game-table');
    if (tableEl) {
      tableEl.classList.add('table-transition');
      setTimeout(() => tableEl.classList.remove('table-transition'), 600);
    }

    currentGame.startNewHand();
    setTimeout(() => {
      currentGame.dealInitialCards();
      setGameState(currentGame.getGameState());
      animateDealing(currentGame, currentUser.settings);
    }, 600);
  };

  const handleRefillChips = () => {
    const currentGame = gameRef.current;
    if (!currentGame) return;
    const currentUser = refreshSessionUser();
    if (!currentUser) return;

    const humanPlayer = currentGame.players.find(p => p.isHuman);
    if (humanPlayer) {
      humanPlayer.chips = currentUser.settings.initialChips;
    }
    setShowChipsModal(false);
    setRoundToast(null);
    setWinnerHighlight(null);
    setAiStatus({});
    setActionHistory([]);
    currentGame.startNewHand();
    setTimeout(() => {
      currentGame.dealInitialCards();
      setGameState(currentGame.getGameState());
      animateDealing(currentGame, currentUser.settings);
    }, 500);
  };

  // 退出游戏 - 显示结算面板
  const handleExit = () => {
    const currentGame = gameRef.current;
    if (countdownRef.current) {
      clearTimeout(countdownRef.current);
      countdownRef.current = null;
    }
    setRoundToast(null);

    // 保存整局记录到用户历史
    if (currentGame && sessionHistory.length > 0) {
      const currentUser = refreshSessionUser();
      if (currentUser) {
        const humanPlayer = currentGame.players.find(p => p.isHuman);
        const duration = Math.floor((Date.now() - currentGame.startTime) / 1000);
        const gameRecord = {
          id: uuidv4(),
          playedAt: new Date().toISOString(),
          result: humanPlayer.chips > currentUser.settings.initialChips ? 'win' : 'lose',
          playersCount: playerCount,
          initialChips: currentUser.settings.initialChips,
          finalChips: humanPlayer.chips,
          profit: humanPlayer.chips - currentUser.settings.initialChips,
          roundsPlayed: sessionHistory.length,
          bestHand: sessionHistory.map(r => r.bestHand).filter(Boolean).pop() || '',
          durationSeconds: duration,
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
        addGameHistory(currentUser.userId, gameRecord);
      }
    }

    setShowSettlement(true);
  };

  const getValidActions = useCallback(() => {
    const game = gameRef.current;
    if (!game || !gameState) return [];
    if (gameState.stage === GAME_STAGES.WAITING ||
        gameState.stage === GAME_STAGES.RESULT ||
        gameState.stage === GAME_STAGES.DEALING) return [];

    const currentPlayer = game.getCurrentPlayer();
    if (!currentPlayer || !currentPlayer.isHuman) return [];

    return game.getValidActions();
  }, [gameState]);

  // 计算各玩家总收支
  const getPlayerStats = () => {
    const game = gameRef.current;
    if (!game) return [];
    const initialChips = user?.settings?.initialChips || 1000;
    return game.players.map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      chips: p.chips,
      profit: p.chips - initialChips,
      isHuman: p.isHuman
    }));
  };

  // 人类玩家当前牌型提示（仅在轮到人类行动时显示）
  const getHumanHandHint = () => {
    if (!gameState) return '';
    const playing = gameState.stage !== GAME_STAGES.WAITING &&
      gameState.stage !== GAME_STAGES.DEALING &&
      gameState.stage !== GAME_STAGES.RESULT;
    if (!playing) return '';
    const human = gameState.players.find(p => p.isHuman);
    if (!human || human.folded || !human.hand || human.hand.length < 2) return '';
    return describeCurrentHand(human.hand, gameState.communityCards);
  };

  if (!gameState) {
    return (
      <div className="page-container">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="page-container game-page">
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

      {/* 轮到你下注的花字提示（与联机模式对齐） */}
      {showTurnNotice && (
        <div className="your-turn-notice">
          轮到您下注
        </div>
      )}

      <Table
        gameState={gameState}
        aiStatus={aiStatus}
        userSettings={user?.settings}
        thinkingAi={thinkingAi}
        totalPlayers={playerCount}
        winnerHighlight={winnerHighlight}
        dealingCards={dealingCards}
        stealthMode={stealthMode}
      />

      {getValidActions().length > 0 && !roundToast && dealingComplete && actionBarReady && (
        <>
          <div className="hand-hint">
            <span className="your-turn-tag">● 轮到你了</span>
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

      <GameLog
        logs={gameState.gameLog}
        collapsed={logCollapsed}
        onToggle={() => setLogCollapsed(!logCollapsed)}
      />

      {roundToast && (
        <div className={`round-toast toast-${roundToast.type}`}>
          <span className="toast-text">{roundToast.text}</span>
        </div>
      )}

      {allInFlash && (
        <div className="allin-drama">
          <div className="allin-flash"></div>
          <div className="allin-text">
            <span className="allin-big">ALL IN</span>
            <span className="allin-name">{allInFlash}</span>
          </div>
        </div>
      )}

      {showVictory && (
        <div className="result-overlay victory-overlay">
          <div className="result-card result-win victory-card">
            <div className="victory-banner">🏆</div>
            <h1 className="result-title victory-title">完胜！</h1>
            <p className="result-subtitle">你已淘汰所有对手，赢得最终胜利！</p>
            <div className="victory-stats">
              <div className="victory-stat">
                <span className="stat-label">最终筹码</span>
                <span className="stat-value">{user && game?.players.find(p => p.isHuman)?.chips}</span>
              </div>
              <div className="victory-stat">
                <span className="stat-label">累计对局</span>
                <span className="stat-value">{sessionHistory.length} 局</span>
              </div>
            </div>
            <div className="result-actions">
              <button className="btn btn-primary btn-large" onClick={handleExit}>
                返回菜单
              </button>
            </div>
          </div>
        </div>
      )}

      {showChipsModal && (
        <div className="result-overlay">
          <div className="result-card result-lose">
            <div className="result-badge">💸</div>
            <h1 className="result-title">筹码耗尽</h1>
            <p className="result-subtitle">你的筹码已归零，是否补充筹码继续游戏？</p>
            <div className="result-actions">
              <button className="btn" onClick={handleExit}>结束游戏</button>
              <button className="btn btn-primary" onClick={handleRefillChips}>
                补充筹码 ({user?.settings?.initialChips})
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettlement && (
        <div className="result-overlay">
          <div className="settlement-card">
            <h1 className="settlement-title">游戏结算</h1>
            <p className="settlement-subtitle">共 {sessionHistory.length} 局</p>

            <div className="settlement-players">
              {getPlayerStats().sort((a, b) => b.profit - a.profit).map(p => (
                <div key={p.id} className={`settlement-player ${p.isHuman ? 'is-human' : ''}`}>
                  <span className="sp-avatar">{p.avatar}</span>
                  <span className="sp-name">{p.name}</span>
                  <span className="sp-chips">{p.chips}</span>
                  <span className={`sp-profit ${p.profit >= 0 ? 'text-green' : 'text-red'}`}>
                    {p.profit >= 0 ? '+' : ''}{p.profit}
                  </span>
                </div>
              ))}
            </div>

            <div className="settlement-rounds">
              <h3>回合详情</h3>
              {sessionHistory.map((round, i) => (
                <div key={i} className="settlement-round-item">
                  <div
                    className="round-summary"
                    onClick={() => setExpandedRound(expandedRound === i ? null : i)}
                  >
                    <span className="round-num">第 {round.round} 局</span>
                    <span className="round-winner">{round.winnerNames.join('、')} 赢</span>
                    {round.bestHand && <span className="round-hand">{round.bestHand}</span>}
                    <span className="round-expand">{expandedRound === i ? '▼' : '▶'}</span>
                  </div>
                  {expandedRound === i && (
                    <div className="round-detail">
                      {round.playerChips.map(p => (
                        <div key={p.id} className="round-detail-player">
                          <span>{p.name}</span>
                          <span className="round-detail-chips">{p.chips} 筹码</span>
                          {round.winners[p.id] && (
                            <span className="text-green">+{round.winners[p.id]}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="settlement-actions">
              <button className="btn btn-primary btn-large" onClick={onBack}>
                返回菜单
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 版本标记 - 用于确认代码更新 */}
      <div style={{position: 'fixed', bottom: '5px', right: '5px', fontSize: '10px', color: '#666', zIndex: 9999}}>
        v2026.06.08-fix8
      </div>

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

      {/* 回合结束弹窗 */}
      {showRoundSummary && roundSummaryData && (
        <RoundSummary
          players={roundSummaryData.players}
          result={roundSummaryData.result}
          initialChips={roundSummaryData.initialChips}
          communityCards={roundSummaryData.communityCards}
          isOnlineMode={false}
        />
      )}
    </div>
  );
};

export default Game;
