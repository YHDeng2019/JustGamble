import { ref, set, update, get, onValue, off, push, onChildAdded, remove } from 'firebase/database';
import { getFirebaseDB } from '../services/firebase';
import { GameEngine } from './engine';
import { localAIDecide } from '../ai/localPlayer';
import { createDeck, shuffleDeck } from './deck';
import { isPlayerOnline } from '../services/heartbeatService';
import { estimateHandStrength } from './handEval';

/**
 * 联机游戏引擎适配器
 * 负责客户端游戏引擎与 Firebase 同步
 */
export class OnlineGameEngine {
  constructor(roomId, userId, isHost = false) {
    this.roomId = roomId;
    this.userId = userId;
    this.isHost = isHost;
    this.engine = new GameEngine();
    this.listeners = [];
    this.stateChangeCallbacks = [];
    this.turnTimeouts = new Map(); // 超时处理
    this.lastProcessedUpdate = 0; // 防止重复处理（时间戳）
    this.lastProcessedSequence = 0; // 防止乱序（序列号）
    this.aiDecisionPending = false; // AI 决策锁
    this.quickDealing = false; // all-in 快速翻牌锁，防止重复触发
    this.advancingNextHand = false; // 开新一手锁，防止 RESULT 重复触发多个定时器
  }

  /**
   * 初始化游戏（仅房主调用）
   */
  async initGame(room) {
    if (!this.isHost) {
      throw new Error('只有房主可以初始化游戏');
    }

    const db = getFirebaseDB();
    const players = Object.values(room.players).map((p, index) => ({
      id: p.userId,
      name: p.displayName,
      avatar: p.avatar,
      isHuman: !p.isBot,
      chips: room.settings.initialChips,
      hand: [],
      bet: 0,
      folded: false,
      allIn: false,
      hasActed: false,
      showHand: false,
      handName: '',
      style: p.style || 'balanced'
    }));

    // 初始化本地引擎
    this.engine.initGame(players, room.settings);

    // 生成确定性洗牌种子并洗牌
    const seed = Date.now();
    const deck = createDeck();
    const shuffledDeck = shuffleDeck(deck, seed);

    // 将洗好的牌设置到引擎中
    this.engine.deck = shuffledDeck;

    // 开始新手牌并发牌
    this.engine.startNewHand();
    this.engine.dealInitialCards();

    // 获取初始游戏状态
    const gameState = this.engine.getGameState();

    // 将状态推送到 Firebase
    await set(ref(db, `rooms/${this.roomId}/gameState`), {
      ...gameState,
      deckSeed: seed,
      lastUpdate: Date.now(),
      sequence: 1  // 初始序列号
    });

    console.log('[联机引擎] 游戏已初始化，玩家手牌已发放');

    // 房主开始监听非房主玩家的动作
    this.subscribeToPlayerActions();
  }

  /**
   * 重新开始游戏（仅房主）- 重置所有玩家筹码，开始新一局
   */
  async restartGame(initialChips) {
    if (!this.isHost) throw new Error('只有房主可以重启游戏');
    const db = getFirebaseDB();

    // 重置所有玩家筹码和状态
    this.engine.players.forEach(p => {
      p.chips = initialChips;
      p.hand = [];
      p.bet = 0;
      p.folded = false;
      p.allIn = false;
      p.hasActed = false;
      p.showHand = false;
      p.handName = '';
    });

    // 重新洗牌
    const seed = Date.now();
    this.engine.deck = shuffleDeck(createDeck(), seed);
    this.engine.isFirstHand = true;
    this.engine.roundsPlayed = 0;
    this.engine.lastShowdownResult = null;
    this.quickDealing = false;
    this.advancingNextHand = false;

    this.engine.startNewHand();
    this.engine.dealInitialCards();

    const gameState = this.engine.getGameState();
    const nextSequence = (this.lastProcessedSequence || 0) + 1;

    // 清除 gameOver 标志，推送新游戏状态
    await update(ref(db, `rooms/${this.roomId}/gameState`), {
      ...gameState,
      deckSeed: seed,
      lastUpdate: Date.now(),
      sequence: nextSequence,
      gameOver: false,
      gameOverWinnerId: null,
      gameOverWinnerName: ''
    });

    console.log('[联机引擎] 游戏已重启');
  }

  /**
   * 订阅游戏状态变化
   */
  subscribeToGameState(callback) {
    const db = getFirebaseDB();
    const gameStateRef = ref(db, `rooms/${this.roomId}/gameState`);

    const listener = onValue(gameStateRef, (snapshot) => {
      if (snapshot.exists()) {
        const serverState = snapshot.val();

        // 序列号检查：只处理严格递增的序列号，防止重复处理和乱序
        if (serverState.sequence !== undefined && this.lastProcessedSequence !== undefined) {
          if (serverState.sequence <= this.lastProcessedSequence) {
            console.warn('[联机引擎] 收到过期/重复状态 sequence:', serverState.sequence, '已处理:', this.lastProcessedSequence, '跳过');
            return;
          }
        }

        // 时间戳检查：双重保险（仅在没有序列号时使用）
        if (!serverState.sequence && serverState.lastUpdate <= this.lastProcessedUpdate) {
          console.warn('[联机引擎] 收到过期状态(时间戳) lastUpdate:', serverState.lastUpdate, '已处理:', this.lastProcessedUpdate, '跳过');
          return;
        }

        this.lastProcessedUpdate = serverState.lastUpdate;
        this.lastProcessedSequence = serverState.sequence || 0;

        console.log('[联机引擎] 应用服务器状态 sequence:', serverState.sequence, 'stage:', serverState.stage, 'currentPlayer:', serverState.currentPlayerIndex);

        this.applyServerState(serverState);
        callback(this.getVisibleState());
      }
    });

    this.stateChangeCallbacks.push(callback);
    this.listeners.push(() => off(gameStateRef, 'value', listener));

    return () => {
      off(gameStateRef, 'value', listener);
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * 订阅非房主玩家的动作（仅房主调用）
   */
  subscribeToPlayerActions() {
    if (!this.isHost) return;

    const db = getFirebaseDB();
    const actionsRef = ref(db, `rooms/${this.roomId}/actions`);

    const listener = onChildAdded(actionsRef, async (snapshot) => {
      const action = snapshot.val();

      console.log('[联机引擎] 收到玩家动作:', action);

      // 验证是否是当前玩家的回合
      const state = this.engine.getGameState();
      const currentPlayer = state.players[state.currentPlayerIndex];

      if (currentPlayer && currentPlayer.id === action.userId && currentPlayer.isHuman) {
        try {
          // 执行动作
          this.engine.executeAction(action.action, action.amount || 0);

          // 获取新状态并推送
          const newState = this.engine.getGameState();
          const nextSequence = (this.lastProcessedSequence || 0) + 1;

          await update(ref(db, `rooms/${this.roomId}/gameState`), {
            ...newState,
            lastUpdate: Date.now(),
            sequence: nextSequence,
            lastAction: {
              userId: action.userId,
              action: action.action,
              amount: action.amount || 0,
              timestamp: Date.now()
            }
          });

          console.log('[联机引擎] 玩家动作已处理:', action.action);

          // 删除已处理的动作
          await remove(snapshot.ref);
        } catch (err) {
          console.error('[联机引擎] 处理玩家动作失败:', err);
        }
      } else {
        console.warn('[联机引擎] 收到无效动作，当前玩家:', currentPlayer?.id, '动作玩家:', action.userId);
        // 删除无效动作
        await remove(snapshot.ref);
      }
    });

    this.listeners.push(() => off(actionsRef, 'child_added', listener));
  }

  /**
   * 应用服务器状态到本地引擎
   */
  applyServerState(serverState) {
    console.log('[联机引擎] applyServerState 开始 - stage:', serverState.stage, 'currentPlayer:', serverState.currentPlayerIndex, 'isHost:', this.isHost);

    // 保存游戏结束信息（透传给客户端显示胜负界面）
    this._gameOver = serverState.gameOver || false;
    this._gameOverWinnerId = serverState.gameOverWinnerId || null;
    this._gameOverWinnerName = serverState.gameOverWinnerName || '';

    // 更新引擎核心状态
    this.engine.stage = serverState.stage;

    // 深拷贝玩家状态，避免引用累积
    this.engine.players = (serverState.players || []).map(p => ({
      ...p,
      hand: Array.isArray(p.hand) ? [...p.hand] : [],
      bet: p.bet || 0,
      folded: !!p.folded,
      allIn: !!p.allIn,
      hasActed: !!p.hasActed
    }));

    this.engine.communityCards = serverState.communityCards ? [...serverState.communityCards] : [];
    this.engine.currentPlayerIndex = serverState.currentPlayerIndex;
    this.engine.dealerIndex = serverState.dealerIndex;
    this.engine.gameLog = serverState.gameLog ? [...serverState.gameLog] : [];
    this.engine.startTime = serverState.startTime;
    this.engine.roundsPlayed = serverState.roundsPlayed || 0;

    // 同步牌组（如果有）
    if (serverState.deck) {
      this.engine.deck = [...serverState.deck];
    }

    // 同步下注相关状态
    if (serverState.lastRaise !== undefined) {
      this.engine.lastRaise = serverState.lastRaise;
    }

    // 更新底池管理器
    if (this.engine.potManager) {
      this.engine.potManager.mainPot = serverState.pot || 0;
      if (serverState.sidePots) {
        this.engine.potManager.sidePots = serverState.sidePots;
      }
    }

    // 同步盲注设置
    if (serverState.bigBlind !== undefined) {
      this.engine.bigBlind = serverState.bigBlind;
    }
    if (serverState.smallBlind !== undefined) {
      this.engine.smallBlind = serverState.smallBlind;
    }

    // 同步摊牌结果（非房主需要这个数据来显示牌型和获胜者信息）
    if (serverState.lastShowdownResult) {
      this.engine.lastShowdownResult = serverState.lastShowdownResult;
    } else if (serverState.stage !== 'RESULT') {
      // 非 RESULT 阶段时清除旧结果
      this.engine.lastShowdownResult = null;
    }

    // 如果是房主，立即检查 AI 和超时
    if (this.isHost) {
      console.log('[联机引擎] 房主立即触发检查');
      // 使用 Promise.resolve 确保在当前调用栈之后执行
      Promise.resolve().then(() => {
        this.checkAndExecuteAI();
        this.checkPlayerTimeouts();
        this.checkGameFlowAdvance();
      });
    }
  }

  /**
   * 获取对当前用户可见的游戏状态（隐藏其他玩家手牌）
   */
  getVisibleState() {
    const state = this.engine.getGameState();

    // 隐藏其他玩家的手牌
    const visiblePlayers = state.players.map(player => {
      // 确保 player 和 hand 都存在
      if (!player || !player.hand) {
        console.warn('[联机引擎] 玩家数据不完整:', player);
        return player;
      }

      if (player.id === this.userId || player.showHand) {
        return player; // 自己的牌或已摊牌的可见
      }
      return {
        ...player,
        hand: player.hand.map((card, idx) => ({
          suit: 'back',
          value: 'back',
          id: `back-${player.id}-${idx}`,
          isBack: true
        })) // 隐藏手牌 - 使用正确的牌背格式
      };
    });

    return {
      ...state,
      players: visiblePlayers,
      gameOver: this._gameOver || false,
      gameOverWinnerId: this._gameOverWinnerId || null,
      gameOverWinnerName: this._gameOverWinnerName || ''
    };
  }

  /**
   * 执行玩家动作（推送到 Firebase）
   */
  async executeAction(action, amount = 0) {
    const db = getFirebaseDB();
    const currentState = this.engine.getGameState();
    const currentPlayer = currentState.players[currentState.currentPlayerIndex];

    if (currentPlayer.id !== this.userId) {
      throw new Error('不是你的回合');
    }

    // 如果是房主，直接执行并推送新状态
    if (this.isHost) {
      this.engine.executeAction(action, amount);
      const newState = this.engine.getGameState();
      const nextSequence = (this.lastProcessedSequence || 0) + 1;

      await update(ref(db, `rooms/${this.roomId}/gameState`), {
        ...newState,
        lastUpdate: Date.now(),
        sequence: nextSequence,
        lastAction: {
          userId: this.userId,
          action,
          amount,
          timestamp: Date.now()
        }
      });
    } else {
      // 非房主，推送动作请求到 Firebase
      await push(ref(db, `rooms/${this.roomId}/actions`), {
        userId: this.userId,
        action,
        amount,
        timestamp: Date.now()
      });
    }

    console.log(`[联机引擎] ${this.userId} 执行动作: ${action} ${amount}`);
  }

  /**
   * 检查并执行 AI 决策（仅房主）
   */
  async checkAndExecuteAI() {
    console.log('[联机引擎] checkAndExecuteAI 被调用, isHost:', this.isHost, 'aiDecisionPending:', this.aiDecisionPending);

    if (!this.isHost) return;
    if (this.aiDecisionPending) return;

    const state = this.engine.getGameState();
    const currentPlayer = state.players[state.currentPlayerIndex];

    console.log('[联机引擎] 当前玩家:', currentPlayer?.name, 'isHuman:', currentPlayer?.isHuman, 'hasActed:', currentPlayer?.hasActed, 'chips:', currentPlayer?.chips);

    if (!currentPlayer || currentPlayer.folded || currentPlayer.allIn || currentPlayer.chips <= 0) {
      return;
    }

    // 确保玩家有手牌数据
    if (!currentPlayer.hand || currentPlayer.hand.length === 0) {
      console.warn('[联机引擎] 当前玩家没有手牌');
      return;
    }

    // 如果是 AI 且未行动
    if (!currentPlayer.isHuman && !currentPlayer.hasActed) {
      console.log('[联机引擎] 触发AI决策:', currentPlayer.name, 'index:', state.currentPlayerIndex);
      this.aiDecisionPending = true;
      const savedPlayerId = currentPlayer.id;

      // 拟人化思考时间：中等牌力 + 面对下注时最纠结（想得久），强牌/烂牌决策清晰（快）
      const toCall = this.engine.getAmountToCall(currentPlayer);
      const strength = estimateHandStrength(currentPlayer.hand, state.communityCards); // 0~1
      // 决策难度：牌力越接近 0.5 越纠结（钟形），面对跟注压力进一步加时
      const ambiguity = 1 - Math.abs(strength - 0.5) * 2; // 0(清晰)~1(最纠结)
      const facingBet = toCall > 0 ? 1 : 0.5;
      const base = 700;
      const span = 1600 * ambiguity * facingBet;
      const thinkTime = base + span + Math.random() * 400;

      console.log(`[联机引擎] AI ${currentPlayer.name} 思考时间: ${Math.round(thinkTime)}ms (牌力:${strength.toFixed(2)}, 纠结度:${ambiguity.toFixed(2)})`);

      // 延迟执行，模拟思考时间
      setTimeout(async () => {
        try {
          // 重新获取最新状态，验证仍然是该 AI 的回合
          const latestState = this.engine.getGameState();
          const latestCurrentPlayer = latestState.players[latestState.currentPlayerIndex];

          if (latestCurrentPlayer.id !== savedPlayerId ||
              latestCurrentPlayer.hasActed ||
              latestCurrentPlayer.folded ||
              latestCurrentPlayer.isHuman) {
            console.log('[联机引擎] AI 回合已变化，取消决策');
            this.aiDecisionPending = false;
            return;
          }

          const decision = localAIDecide({
            hand: latestCurrentPlayer.hand,
            community: latestState.communityCards,
            toCall: this.engine.getAmountToCall(latestCurrentPlayer),
            pot: latestState.pot,
            stack: latestCurrentPlayer.chips,
            bet: latestCurrentPlayer.bet,
            style: latestCurrentPlayer.style,
            stage: latestState.stage,
            position: latestState.currentPlayerIndex,
            numPlayers: latestState.players.length
          });

          console.log(`[联机引擎] AI ${latestCurrentPlayer.name} 决策结果: ${decision.action} ${decision.amount || 0}`);

          this.engine.executeAction(decision.action, decision.amount || 0);
          const newState = this.engine.getGameState();

          const db = getFirebaseDB();

          // 关键修复：使用当前已处理的序列号而不是本地引擎状态
          // 本地引擎状态不包含sequence字段，必须从lastProcessedSequence获取
          const nextSequence = (this.lastProcessedSequence || 0) + 1;

          console.log(`[联机引擎] AI推送新状态 sequence: ${this.lastProcessedSequence} → ${nextSequence}`);

          // 关键修复：在 update 之前释放锁
          // Firebase 的 onValue 监听器可能在 await 返回前就触发
          // 如果锁在 update 后才释放，下一个 AI 检查会被阻塞
          this.aiDecisionPending = false;

          await update(ref(db, `rooms/${this.roomId}/gameState`), {
            ...newState,
            lastUpdate: Date.now(),
            sequence: nextSequence,
            lastAction: {
              userId: latestCurrentPlayer.id,
              action: decision.action,
              amount: decision.amount || 0,
              timestamp: Date.now(),
              isBot: true
            }
          });

          console.log(`[联机引擎] AI ${latestCurrentPlayer.name} 状态已推送到Firebase`);

          // 不要在这里调用 checkAndExecuteAI，让 applyServerState 来触发
          // 这样可以确保状态完全同步后再继续

        } catch (err) {
          console.error('[联机引擎] AI 决策执行失败:', err);
          this.aiDecisionPending = false;
        }
      }, thinkTime);
    }
  }

  /**
   * 检查玩家超时（仅房主）
   */
  async checkPlayerTimeouts() {
    if (!this.isHost) return;

    const db = getFirebaseDB();
    const state = this.engine.getGameState();
    const currentPlayer = state.players[state.currentPlayerIndex];

    if (!currentPlayer || currentPlayer.folded || currentPlayer.allIn || !currentPlayer.isHuman || currentPlayer.chips <= 0) {
      return;
    }

    // 检测玩家是否离线（通过房间数据的心跳检测）
    const roomRef = ref(db, `rooms/${this.roomId}/players/${currentPlayer.id}`);
    const roomSnapshot = await get(roomRef);
    const roomPlayer = roomSnapshot.val();

    if (roomPlayer && !isPlayerOnline(roomPlayer)) {
      console.log(`[联机引擎] 玩家 ${currentPlayer.name} 已离线，标记并自动弃牌`);

      // 标记玩家离线
      this.engine.executeAction('fold', 0);
      const newState = this.engine.getGameState();

      // 在游戏状态中标记该玩家为离线
      const playerIndex = newState.players.findIndex(p => p.id === currentPlayer.id);
      if (playerIndex !== -1) {
        newState.players[playerIndex].isOffline = true;
      }

      const nextSequence = (this.lastProcessedSequence || 0) + 1;

      await update(ref(db, `rooms/${this.roomId}/gameState`), {
        ...newState,
        lastUpdate: Date.now(),
        sequence: nextSequence,
        lastAction: {
          userId: currentPlayer.id,
          action: 'fold',
          amount: 0,
          timestamp: Date.now(),
          offline: true
        }
      });

      this.engine.addLog(currentPlayer.name, '已离线', 'muted');
      return;
    }

    // 清除旧的超时计时器
    if (this.turnTimeouts.has(currentPlayer.id)) {
      clearTimeout(this.turnTimeouts.get(currentPlayer.id));
    }

    const savedPlayerId = currentPlayer.id;

    // 设置30秒超时
    const timeoutId = setTimeout(async () => {
      try {
        // 重新获取最新状态，验证仍然是该玩家的回合且未行动
        const latestState = this.engine.getGameState();
        const latestCurrentPlayer = latestState.players[latestState.currentPlayerIndex];

        if (latestCurrentPlayer.id !== savedPlayerId ||
            latestCurrentPlayer.hasActed ||
            latestCurrentPlayer.folded) {
          console.log('[联机引擎] 玩家已行动，取消超时');
          return;
        }

        console.log(`[联机引擎] 玩家 ${latestCurrentPlayer.name} 超时，自动弃牌`);

        this.engine.executeAction('fold', 0);
        const newState = this.engine.getGameState();
        const nextSequence = (this.lastProcessedSequence || 0) + 1;

        await update(ref(db, `rooms/${this.roomId}/gameState`), {
          ...newState,
          lastUpdate: Date.now(),
          sequence: nextSequence,
          lastAction: {
            userId: latestCurrentPlayer.id,
            action: 'fold',
            amount: 0,
            timestamp: Date.now(),
            timeout: true
          }
        });
      } catch (err) {
        console.error('[联机引擎] 超时处理失败:', err);
      } finally {
        this.turnTimeouts.delete(savedPlayerId);
      }
    }, 30000);

    this.turnTimeouts.set(currentPlayer.id, timeoutId);
  }

  /**
   * 检查游戏流程推进（仅房主）
   */
  async checkGameFlowAdvance() {
    if (!this.isHost) return;

    const state = this.engine.getGameState();
    const db = getFirebaseDB();

    // 处理 SHOWDOWN 阶段 - 延迟后开始新一手
    if (state.stage === 'SHOWDOWN' || state.stage === 'RESULT') {
      // 加锁防止 RESULT 状态多次推送导致重复开新一手（筹码累积bug根源）
      if (this.advancingNextHand) return;
      this.advancingNextHand = true;
      console.log('[联机引擎] 游戏结束，准备开始新一手');

      // 单人模式配置：摊牌 toast 显示 6500ms，弃牌 3500ms
      // 这里延迟 8000ms 确保玩家看完 toast
      setTimeout(async () => {
        try {
          // 检查是否有玩家破产
          const activePlayers = this.engine.players.filter(p => p.chips > 0);

          if (activePlayers.length < 2) {
            console.log('[联机引擎] 游戏结束，玩家不足，推送 gameOver');
            // 推送游戏结束状态，含赢家信息，供客户端显示胜利/失败界面
            const winner = activePlayers[0] || null;
            const finalState = this.engine.getGameState();
            const nextSequence = (this.lastProcessedSequence || 0) + 1;
            await update(ref(db, `rooms/${this.roomId}/gameState`), {
              ...finalState,
              lastUpdate: Date.now(),
              sequence: nextSequence,
              gameOver: true,
              gameOverWinnerId: winner ? winner.id : null,
              gameOverWinnerName: winner ? winner.name : ''
            });
            this.advancingNextHand = false; // 释放锁
            return;
          }

          // 开始新一手（单人模式：600ms 桌面过渡 + 600ms dealInitialCards）
          this.engine.startNewHand();

          // 延迟 600ms 再发牌（对齐单人模式）
          setTimeout(async () => {
            this.engine.dealInitialCards();
            const newState = this.engine.getGameState();
            const nextSequence = (this.lastProcessedSequence || 0) + 1;

            await update(ref(db, `rooms/${this.roomId}/gameState`), {
              ...newState,
              lastUpdate: Date.now(),
              sequence: nextSequence
            });

            this.advancingNextHand = false; // 新一手已开始，释放锁
            console.log('[联机引擎] 新一手已开始');
          }, 600);

        } catch (err) {
          this.advancingNextHand = false; // 出错也释放锁
          console.error('[联机引擎] 开始新一手失败:', err);
        }
      }, 8000);

      return;
    }

    // 检查是否所有活跃玩家都 All-in（快速摊牌）
    const activePlayers = state.players.filter(p => !p.folded);
    const allInPlayers = activePlayers.filter(p => p.allIn);

    if (allInPlayers.length === activePlayers.length && activePlayers.length > 1) {
      // 加锁防止逐张翻牌过程中重复触发
      if (this.quickDealing) return;
      this.quickDealing = true;
      console.log('[联机引擎] 所有玩家 All-in，开始逐张翻牌');
      this.quickDealToShowdown();
      return;
    }

    // 检查当前下注回合是否结束
    if (this.engine.isBettingRoundComplete()) {
      console.log('[联机引擎] 下注回合结束，推进游戏阶段');

      // 单人模式配置：阶段切换时停顿 800ms 让玩家看清公共牌
      setTimeout(async () => {
        try {
          // 推进到下一阶段
          this.engine.nextStage();
          const newState = this.engine.getGameState();
          const nextSequence = (this.lastProcessedSequence || 0) + 1;

          // 如果到了 RESULT 阶段，把摊牌结果也一起推送（非房主需要它来显示牌型）
          const showdownResult = this.engine.lastShowdownResult || null;

          await update(ref(db, `rooms/${this.roomId}/gameState`), {
            ...newState,
            lastUpdate: Date.now(),
            sequence: nextSequence,
            ...(showdownResult ? { lastShowdownResult: showdownResult } : {})
          });

          console.log('[联机引擎] 游戏阶段已推进:', newState.stage);
        } catch (err) {
          console.error('[联机引擎] 游戏流程推进失败:', err);
        }
      }, 800);
    }
  }

  /**
   * 快速摊牌（所有玩家 All-in 时）- 一张一张地翻公共牌
   */
  async quickDealToShowdown() {
    const db = getFirebaseDB();

    const dealNext = async () => {
      // 传入 skipAllInFastForward=true，让引擎逐阶段推进（不一次性发完）
      this.engine.nextStage(true);
      const newState = this.engine.getGameState();
      const nextSequence = (this.lastProcessedSequence || 0) + 1;

      const showdownResult = this.engine.lastShowdownResult || null;

      await update(ref(db, `rooms/${this.roomId}/gameState`), {
        ...newState,
        lastUpdate: Date.now(),
        sequence: nextSequence,
        ...(showdownResult ? { lastShowdownResult: showdownResult } : {})
      });

      console.log('[联机引擎] 快速摊牌推进:', newState.stage);

      if (newState.stage === 'RESULT') {
        this.quickDealing = false; // 释放锁
        return; // 结束
      } else {
        // 每阶段间隔 1200ms，让玩家看清逐张翻出的公共牌
        setTimeout(() => dealNext(), 1200);
      }
    };

    // 开始逐张翻牌
    setTimeout(() => dealNext(), 800);
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners = [];
    this.stateChangeCallbacks = [];

    // 清除所有超时计时器
    this.turnTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.turnTimeouts.clear();
  }
}
