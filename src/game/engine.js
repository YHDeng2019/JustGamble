import { createDeck, shuffleDeck, dealCard } from './deck';
import { evaluateHand, compareHands } from './handEval';
import { PotManager } from './pot';
import { debugLog } from './debugLog';

export const GAME_STAGES = {
  WAITING: 'WAITING',
  DEALING: 'DEALING',
  PRE_FLOP: 'PRE_FLOP',
  FLOP: 'FLOP',
  TURN: 'TURN',
  RIVER: 'RIVER',
  SHOWDOWN: 'SHOWDOWN',
  RESULT: 'RESULT'
};

export class GameEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.deck = [];
    this.communityCards = [];
    this.players = [];
    this.potManager = new PotManager();
    this.stage = GAME_STAGES.WAITING;
    this.currentPlayerIndex = 0;
    this.dealerIndex = 0;
    this.bigBlind = 20;
    this.smallBlind = 10;
    this.lastRaise = 0;
    this.gameLog = [];
    this.startTime = null;
    this.roundsPlayed = 0;
    this.isFirstHand = true;
  }

  initGame(players, settings) {
    this.reset();
    this.players = players.map((p, i) => ({
      ...p,
      id: p.id || `player_${i}`,
      chips: settings.initialChips,
      hand: [],
      bet: 0,
      folded: false,
      allIn: false,
      hasActed: false,
      isHuman: p.isHuman || false
    }));

    this.bigBlind = settings.bigBlind;
    this.smallBlind = settings.smallBlind;
    this.dealerIndex = 0;

    this.addLog('系统', '游戏开始！');
    return this.startNewHand();
  }

  startNewHand() {
    // 轮转庄家位置（第一手不转）
    if (!this.isFirstHand) {
      this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    }
    this.isFirstHand = false;

    this.deck = shuffleDeck(createDeck());
    this.communityCards = [];
    this.potManager.reset();
    this.currentPlayerIndex = this.dealerIndex;
    this.lastRaise = 0;
    this.roundsPlayed++;
    this.startTime = Date.now();

    for (const player of this.players) {
      player.hand = [];
      player.bet = 0;
      // 没筹码的玩家本手直接坐庄外（标记弃牌），避免轮转/结算时卡死
      player.folded = player.chips <= 0;
      player.allIn = false;
      player.hasActed = false;
      player.showHand = false;
      player.handName = null;
      // 记录本手开始时的筹码，用于回合小结正确计算盈亏
      player.roundStartChips = player.chips;
    }

    this.stage = GAME_STAGES.DEALING;
    this.addLog('系统', '发牌中...');

    debugLog.startSession({
      round: this.roundsPlayed,
      dealerIndex: this.dealerIndex,
      players: this.players.map(p => ({ id: p.id, name: p.name, chips: p.chips, isHuman: p.isHuman }))
    });

    return this;
  }

  dealInitialCards() {
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < this.players.length; j++) {
        const playerIndex = (this.dealerIndex + 1 + j) % this.players.length;
        const card = dealCard(this.deck);
        this.players[playerIndex].hand.push(card);
      }
    }

    this.postBlinds();
    this.stage = GAME_STAGES.PRE_FLOP;
    this.addLog('系统', '进入翻牌前阶段');
    return this;
  }

  postBlinds() {
    const sbIndex = (this.dealerIndex + 1) % this.players.length;
    const bbIndex = (this.dealerIndex + 2) % this.players.length;

    this.placeBet(sbIndex, this.smallBlind);
    this.placeBet(bbIndex, this.bigBlind);

    // 盲注不算主动行动
    this.players[sbIndex].hasActed = false;
    this.players[bbIndex].hasActed = false;

    // 翻牌前从大盲后第一个"能行动"的玩家开始（跳过弃牌/all-in/没筹码）
    const firstActor = this.findActablePlayer((bbIndex + 1) % this.players.length);
    this.currentPlayerIndex = firstActor === -1
      ? (bbIndex + 1) % this.players.length
      : firstActor;
    this.lastRaise = this.bigBlind;
  }

  placeBet(playerIndex, amount) {
    const player = this.players[playerIndex];
    const actualBet = Math.min(amount, player.chips);

    player.chips -= actualBet;
    player.bet += actualBet;
    this.potManager.addToPot(actualBet);

    if (player.chips === 0) {
      player.allIn = true;
      this.addLog(player.name, 'ALL IN!', 'red');
    }
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  // 玩家是否还能行动（未弃牌、未 all-in、且有筹码）
  canAct(player) {
    return !!player && !player.folded && !player.allIn && player.chips > 0;
  }

  // 从 startIndex 起（含）向后查找第一个能行动的玩家下标，找不到返回 -1
  findActablePlayer(startIndex) {
    const n = this.players.length;
    for (let i = 0; i < n; i++) {
      const idx = (startIndex + i) % n;
      if (this.canAct(this.players[idx])) return idx;
    }
    return -1;
  }

  getValidActions() {
    const player = this.getCurrentPlayer();
    const toCall = this.getAmountToCall(player);
    const maxBet = Math.max(...this.players.map(p => p.bet));
    const minRaise = Math.max(this.lastRaise, this.bigBlind);
    const maxRaise = player.chips + player.bet;

    const actions = [];

    // 只有需要跟注时才显示弃牌选项（可以check时不显示fold）
    if (toCall > 0) {
      actions.push({ action: 'fold', label: '弃牌' });
    }

    if (toCall === 0) {
      actions.push({ action: 'check', label: '过牌' });
    } else {
      actions.push({ action: 'call', label: `跟注 ${toCall}`, amount: toCall });
    }

    if (player.chips > 0) {
      // 最小加注 = 当前最高下注 + 最小加注额
      const minRaiseAmount = maxBet + minRaise;
      actions.push({
        action: 'raise',
        label: '加注',
        min: Math.min(minRaiseAmount, maxRaise),
        max: maxRaise
      });
    }

    return actions;
  }

  getAmountToCall(player) {
    const maxBet = Math.max(...this.players.map(p => p.bet));
    return maxBet - player.bet;
  }

  executeAction(action, amount = 0) {
    const player = this.getCurrentPlayer();
    player.hasActed = true;

    debugLog.playerAction(player.name, action, amount, {
      playerIndex: this.currentPlayerIndex,
      chips: player.chips,
      bet: player.bet,
      stage: this.stage,
      pot: this.potManager.mainPot
    });

    switch (action) {
      case 'fold':
        player.folded = true;
        this.addLog(player.name, '弃牌', 'muted');
        break;

      case 'check':
        this.addLog(player.name, '过牌');
        break;

      case 'call': {
        const toCall = this.getAmountToCall(player);
        this.placeBet(this.currentPlayerIndex, toCall);
        this.addLog(player.name, `跟注 ${toCall}`, 'gold');
        break;
      }

      case 'raise': {
        // 检查是否真的是加注：金额必须大于当前最大下注
        const maxBet = Math.max(...this.players.map(p => p.bet));
        if (amount <= maxBet) {
          // 实际上只是跟注，降级为 call 处理
          const toCall = this.getAmountToCall(player);
          this.placeBet(this.currentPlayerIndex, toCall);
          this.addLog(player.name, `跟注 ${toCall}`, 'gold');
        } else {
          // 真正的加注：记录本轮加注额（超出当前最高下注的部分）
          const raiseAmount = amount - maxBet;
          this.lastRaise = raiseAmount;
          this.placeBet(this.currentPlayerIndex, amount);
          this.addLog(player.name, `加注到 ${amount}`, 'gold');
          // 加注后重置其他玩家的行动状态
          for (const p of this.players) {
            if (p !== player && !p.folded && !p.allIn) {
              p.hasActed = false;
            }
          }
        }
        break;
      }
    }

    this.nextPlayer();
    return this;
  }

  nextPlayer() {
    const activePlayers = this.players.filter(p => !p.folded);

    if (activePlayers.length === 1) {
      this.endHand(activePlayers[0]);
      return;
    }

    // 先判断本轮下注是否已结束（与"当前轮到谁"无关）
    if (this.isBettingRoundComplete()) {
      this.nextStage();
      return;
    }

    // 找下一个"能行动"的玩家（跳过弃牌/all-in/没筹码的玩家）
    const next = this.findActablePlayer((this.currentPlayerIndex + 1) % this.players.length);
    if (next === -1) {
      // 没有人能再行动了（都 all-in 或没筹码），直接进入下一阶段
      this.nextStage();
      return;
    }
    this.currentPlayerIndex = next;
  }

  isBettingRoundComplete() {
    const activePlayers = this.players.filter(p => !p.folded);
    if (activePlayers.every(p => p.allIn)) return true;

    // 只有"还能行动"的玩家（未 all-in 且有筹码）才需要行动且下注相等
    // 0 筹码玩家视为不能再行动，不应阻塞本轮结束
    const actablePlayers = activePlayers.filter(p => !p.allIn && p.chips > 0);
    if (actablePlayers.length === 0) return true;

    const allActed = actablePlayers.every(p => p.hasActed);
    if (!allActed) return false;

    const maxBet = Math.max(...activePlayers.map(p => p.bet));
    const allBetsEqual = actablePlayers.every(p => p.bet === maxBet);

    const result = allBetsEqual;
    debugLog.bettingRoundCheck(result, {
      stage: this.stage,
      activePlayers: activePlayers.map(p => ({ id: p.id, bet: p.bet, allIn: p.allIn, hasActed: p.hasActed })),
      maxBet
    });

    return result;
  }

  nextStage() {
    const prevStage = this.stage;
    for (const player of this.players) {
      player.bet = 0;
      player.hasActed = false;
    }
    this.lastRaise = 0;

    // 检测是否所有活跃玩家都all in（或只剩一个还能行动的玩家）
    // 还能行动 = 未 all-in 且有筹码
    const activePlayers = this.players.filter(p => !p.folded);
    const actablePlayers = activePlayers.filter(p => !p.allIn && p.chips > 0);
    const allInSituation = actablePlayers.length <= 1;

    if (allInSituation && this.stage !== GAME_STAGES.RIVER) {
      // 所有人都all in了，直接发完所有公共牌并进入摊牌
      this.addLog('系统', '所有玩家已all in，直接亮牌');

      while (this.communityCards.length < 5) {
        this.communityCards.push(dealCard(this.deck));
      }

      // 根据当前阶段补充日志
      if (this.stage === GAME_STAGES.PRE_FLOP) {
        this.addLog('系统', '翻牌：' + this.communityCards.slice(0, 3).map(c => c.id).join(' '));
        this.addLog('系统', '转牌：' + this.communityCards[3].id);
        this.addLog('系统', '河牌：' + this.communityCards[4].id);
      } else if (this.stage === GAME_STAGES.FLOP) {
        this.addLog('系统', '转牌：' + this.communityCards[3].id);
        this.addLog('系统', '河牌：' + this.communityCards[4].id);
      } else if (this.stage === GAME_STAGES.TURN) {
        this.addLog('系统', '河牌：' + this.communityCards[4].id);
      }

      this.showdown();
      return;
    }

    switch (this.stage) {
      case GAME_STAGES.PRE_FLOP:
        this.stage = GAME_STAGES.FLOP;
        for (let i = 0; i < 3; i++) {
          this.communityCards.push(dealCard(this.deck));
        }
        this.addLog('系统', '翻牌：' + this.communityCards.map(c => c.id).join(' '));
        break;

      case GAME_STAGES.FLOP:
        this.stage = GAME_STAGES.TURN;
        this.communityCards.push(dealCard(this.deck));
        this.addLog('系统', '转牌：' + this.communityCards[this.communityCards.length - 1].id);
        break;

      case GAME_STAGES.TURN:
        this.stage = GAME_STAGES.RIVER;
        this.communityCards.push(dealCard(this.deck));
        this.addLog('系统', '河牌：' + this.communityCards[this.communityCards.length - 1].id);
        break;

      case GAME_STAGES.RIVER:
        this.showdown();
        return;
    }

    debugLog.stageChange(prevStage, this.stage);

    // 新阶段从庄家后第一个"能行动"的玩家开始（跳过弃牌/all-in/没筹码）
    const firstActor = this.findActablePlayer((this.dealerIndex + 1) % this.players.length);
    this.currentPlayerIndex = firstActor === -1
      ? (this.dealerIndex + 1) % this.players.length
      : firstActor;
  }

  showdown() {
    this.stage = GAME_STAGES.SHOWDOWN;
    this.addLog('系统', '摊牌！');

    const activePlayers = this.players.filter(p => !p.folded);
    const playerHands = {};
    const bestHandName = {};

    for (const player of activePlayers) {
      const allCards = [...player.hand, ...this.communityCards];
      playerHands[player.id] = evaluateHand(allCards);
      bestHandName[player.id] = playerHands[player.id].name;
      // 摊牌时翻开手牌并记录牌型
      player.showHand = true;
      player.handName = playerHands[player.id].name;
    }

    const pots = this.potManager.calculatePots(this.players);
    const winners = this.potManager.distributeWinners(pots, playerHands, compareHands);

    for (const [playerId, amount] of Object.entries(winners)) {
      const player = this.players.find(p => p.id === playerId);
      if (player) {
        player.chips += amount;
        this.addLog(player.name, `赢得 ${amount} 筹码！`, 'green');
      }
    }

    this.stage = GAME_STAGES.RESULT;
    const result = {
      winners,
      playerHands,
      bestHand: Object.values(bestHandName).sort((a, b) => {
        const ranks = ['高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺', '皇家同花顺'];
        return ranks.indexOf(b) - ranks.indexOf(a);
      })[0]
    };
    // 存储结果供外部读取，避免重复调用 showdown
    this.lastShowdownResult = result;
    debugLog.showdownResult(winners, playerHands, this.communityCards, activePlayers);
    return result;
  }

  endHand(winner) {
    winner.chips += this.potManager.mainPot;
    this.addLog(winner.name, `获胜！赢得 ${this.potManager.mainPot} 筹码`, 'green');
    this.stage = GAME_STAGES.RESULT;
    debugLog.endHandResult(winner.id, this.potManager.mainPot);
  }

  addLog(player, message, color = 'white') {
    this.gameLog.unshift({
      player,
      message,
      color,
      time: new Date().toLocaleTimeString()
    });
  }

  getGameState() {
    return {
      stage: this.stage,
      players: this.players.map(p => ({
        ...p,
        hand: p.hand ? [...p.hand] : [],
        bet: p.bet || 0,
        chips: p.chips || 0,
        folded: !!p.folded,
        allIn: !!p.allIn,
        hasActed: !!p.hasActed
      })),
      communityCards: [...this.communityCards],
      pot: this.potManager.mainPot,
      currentPlayerIndex: this.currentPlayerIndex,
      dealerIndex: this.dealerIndex,
      gameLog: [...this.gameLog],
      startTime: this.startTime,
      roundsPlayed: this.roundsPlayed
    };
  }
}
