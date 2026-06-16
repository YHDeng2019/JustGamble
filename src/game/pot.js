export class PotManager {
  constructor() {
    this.mainPot = 0;
    this.sidePots = [];
  }

  addToPot(amount) {
    this.mainPot += amount;
  }

  calculatePots(players) {
    const activePlayers = players.filter(p => !p.folded && !p.out);

    // 如果所有玩家的 bet 都是 0（已进入最终结算阶段，bet 已被 nextStage 重置），
    // 直接返回基于 mainPot 的单个 pot
    const totalCurrentBet = activePlayers.reduce((sum, p) => sum + p.bet, 0);
    if (totalCurrentBet === 0) {
      return [{ amount: this.mainPot, eligiblePlayers: activePlayers.map(p => p.id) }];
    }

    const allInPlayers = activePlayers.filter(p => p.allIn);

    if (allInPlayers.length === 0) {
      return [{ amount: this.mainPot, eligiblePlayers: activePlayers.map(p => p.id) }];
    }

    const sortedBets = [...new Set(allInPlayers.map(p => p.bet))].sort((a, b) => a - b);
    const pots = [];
    let previousBet = 0;

    for (const bet of sortedBets) {
      const betDiff = bet - previousBet;
      const eligiblePlayers = activePlayers.filter(p => p.bet >= bet);
      
      if (betDiff > 0 && eligiblePlayers.length > 0) {
        pots.push({
          amount: betDiff * eligiblePlayers.length,
          eligiblePlayers: eligiblePlayers.map(p => p.id)
        });
      }
      previousBet = bet;
    }

    const remainingBet = activePlayers.reduce((sum, p) => sum + Math.max(0, p.bet - previousBet), 0);
    if (remainingBet > 0) {
      pots.push({
        amount: remainingBet,
        eligiblePlayers: activePlayers.map(p => p.id)
      });
    }

    return pots;
  }

  distributeWinners(pots, playerHands, compareHandsFn) {
    const results = {};

    for (const pot of pots) {
      const eligibleHands = pot.eligiblePlayers.map(id => ({
        id,
        hand: playerHands[id]
      })).filter(h => h.hand);

      // 防御：如果有玩家应在底池但手牌丢失，打印警告
      if (eligibleHands.length < pot.eligiblePlayers.length) {
        const missing = pot.eligiblePlayers.filter(id => !playerHands[id]);
        console.warn('[PotManager] 部分玩家手牌缺失，将被排除出赢家计算:', missing);
      }

      if (eligibleHands.length === 0) continue;

      eligibleHands.sort((a, b) => compareHandsFn(b.hand, a.hand));
      const bestHand = eligibleHands[0].hand;
      const winners = eligibleHands.filter(h => compareHandsFn(h.hand, bestHand) === 0);
      const winAmount = Math.floor(pot.amount / winners.length);
      // 零头给第一个赢家（按座位顺序，通常是最有利位置），防止筹码凭空消失
      const remainder = pot.amount - winAmount * winners.length;

      for (let i = 0; i < winners.length; i++) {
        const extra = i === 0 ? remainder : 0;
        results[winners[i].id] = (results[winners[i].id] || 0) + winAmount + extra;
      }
    }

    return results;
  }

  reset() {
    this.mainPot = 0;
    this.sidePots = [];
  }
}

const compareHands = (hand1, hand2) => {
  if (!hand1 || !hand2) return 0;
  if (hand1.rank !== hand2.rank) {
    return hand1.rank - hand2.rank;
  }

  for (let i = 0; i < hand1.kickers.length && i < hand2.kickers.length; i++) {
    if (hand1.kickers[i] !== hand2.kickers[i]) {
      return hand1.kickers[i] - hand2.kickers[i];
    }
  }

  return 0;
};
