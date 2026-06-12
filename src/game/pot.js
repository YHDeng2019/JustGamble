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

      if (eligibleHands.length === 0) continue;

      eligibleHands.sort((a, b) => compareHandsFn(b.hand, a.hand));
      const bestHand = eligibleHands[0].hand;
      const winners = eligibleHands.filter(h => compareHandsFn(h.hand, bestHand) === 0);
      const winAmount = Math.floor(pot.amount / winners.length);

      for (const winner of winners) {
        results[winner.id] = (results[winner.id] || 0) + winAmount;
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
