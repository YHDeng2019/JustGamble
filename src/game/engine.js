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
      player.folded = false;
      player.allIn = false;
      player.hasActed = false;
      player.showHand = false;
      player.handName = null;
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

    this.currentPlayerIndex = (bbIndex + 1) % this.players.length;
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

  getValidActions() {
    const player = this.getCurrentPlayer();
    const toCall = this.getAmountToCall(player);
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
      actions.push({
        action: 'raise',
        label: '加注',
        min: Math.min(player.bet + minRaise, maxRaise),
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
          // 真正的加注
          const raiseAmount = amount - player.bet;
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

    do {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    } while (this.players[this.currentPlayerIndex].folded);

    if (this.isBettingRoundComplete()) {
      this.nextStage();
    }
  }

  isBettingRoundComplete() {
    const activePlayers = this.players.filter(p => !p.folded);
    if (activePlayers.every(p => p.allIn)) return true;

    // 所有未 all-in 的活跃玩家必须已行动且下注额相等
    const nonAllInPlayers = activePlayers.filter(p => !p.allIn);
    if (nonAllInPlayers.length === 0) return true;

    const allActed = nonAllInPlayers.every(p => p.hasActed);
    if (!allActed) return false;

    const maxBet = Math.max(...activePlayers.map(p => p.bet));
    const allBetsEqual = nonAllInPlayers.every(p => p.bet === maxBet);

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

    this.currentPlayerIndex = (this.dealerIndex + 1) % this.players.length;
    while (this.players[this.currentPlayerIndex].folded) {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    }
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
      players: [...this.players],
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
