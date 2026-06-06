import { getValueRank } from './deck';

const HAND_RANKS = {
  HIGH_CARD: { rank: 0, name: '高牌' },
  ONE_PAIR: { rank: 1, name: '一对' },
  TWO_PAIR: { rank: 2, name: '两对' },
  THREE_OF_A_KIND: { rank: 3, name: '三条' },
  STRAIGHT: { rank: 4, name: '顺子' },
  FLUSH: { rank: 5, name: '同花' },
  FULL_HOUSE: { rank: 6, name: '葫芦' },
  FOUR_OF_A_KIND: { rank: 7, name: '四条' },
  STRAIGHT_FLUSH: { rank: 8, name: '同花顺' },
  ROYAL_FLUSH: { rank: 9, name: '皇家同花顺' }
};

export const evaluateHand = (cards) => {
  if (cards.length < 5) {
    return { ...HAND_RANKS.HIGH_CARD, cards: [] };
  }

  const combinations = getCombinations(cards, 5);
  let bestHand = null;

  for (const combo of combinations) {
    const evaluated = evaluateFiveCards(combo);
    if (!bestHand || compareHands(evaluated, bestHand) > 0) {
      bestHand = evaluated;
    }
  }

  return bestHand;
};

const getCombinations = (arr, size) => {
  const result = [];
  
  const combine = (start, combo) => {
    if (combo.length === size) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      combine(i + 1, combo);
      combo.pop();
    }
  };
  
  combine(0, []);
  return result;
};

const evaluateFiveCards = (cards) => {
  const sortedCards = [...cards].sort((a, b) => getValueRank(b.value) - getValueRank(a.value));
  const valueCounts = {};
  const suitCounts = {};

  for (const card of sortedCards) {
    valueCounts[card.value] = (valueCounts[card.value] || 0) + 1;
    suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
  }

  const isFlush = Object.values(suitCounts).some(count => count === 5);
  const isStraight = checkStraight(sortedCards);
  const isLowStraight = checkLowStraight(sortedCards);

  const counts = Object.values(valueCounts).sort((a, b) => b - a);
  const pairs = counts.filter(c => c === 2).length;
  const threeOfKind = counts.includes(3);
  const fourOfKind = counts.includes(4);

  let handType;

  if (isFlush && isStraight && sortedCards[0].value === 'A') {
    handType = HAND_RANKS.ROYAL_FLUSH;
  } else if (isFlush && (isStraight || isLowStraight)) {
    handType = HAND_RANKS.STRAIGHT_FLUSH;
  } else if (fourOfKind) {
    handType = HAND_RANKS.FOUR_OF_A_KIND;
  } else if (threeOfKind && pairs === 1) {
    handType = HAND_RANKS.FULL_HOUSE;
  } else if (isFlush) {
    handType = HAND_RANKS.FLUSH;
  } else if (isStraight || isLowStraight) {
    handType = HAND_RANKS.STRAIGHT;
  } else if (threeOfKind) {
    handType = HAND_RANKS.THREE_OF_A_KIND;
  } else if (pairs === 2) {
    handType = HAND_RANKS.TWO_PAIR;
  } else if (pairs === 1) {
    handType = HAND_RANKS.ONE_PAIR;
  } else {
    handType = HAND_RANKS.HIGH_CARD;
  }

  return {
    ...handType,
    cards: sortedCards,
    kickers: getKickers(sortedCards, valueCounts)
  };
};

const checkStraight = (cards) => {
  const ranks = cards.map(c => getValueRank(c.value)).sort((a, b) => b - a);
  for (let i = 0; i < ranks.length - 1; i++) {
    if (ranks[i] - ranks[i + 1] !== 1) return false;
  }
  return true;
};

const checkLowStraight = (cards) => {
  const values = cards.map(c => c.value).sort();
  return values[0] === '2' && values[1] === '3' && values[2] === '4' && values[3] === '5' && values[4] === 'A';
};

const getKickers = (cards, valueCounts) => {
  const sortedByCount = [...cards].sort((a, b) => {
    const countDiff = (valueCounts[b.value] || 0) - (valueCounts[a.value] || 0);
    if (countDiff !== 0) return countDiff;
    return getValueRank(b.value) - getValueRank(a.value);
  });
  return sortedByCount.map(c => getValueRank(c.value));
};

export const compareHands = (hand1, hand2) => {
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

export const estimateHandStrength = (hand, community) => {
  const allCards = [...hand, ...community];
  if (allCards.length < 2) return 0;

  const evaluated = evaluateHand(allCards);
  
  return (evaluated.rank + 1) / 10;
};

// 描述玩家当前能组成的最佳牌型（支持 2~7 张牌）
export const describeCurrentHand = (hand, community) => {
  if (!hand || hand.length < 2) return '';
  const allCards = [...hand, ...community];

  // 翻牌前：只有 2 张手牌
  if (allCards.length < 5) {
    const counts = {};
    for (const c of allCards) {
      counts[c.value] = (counts[c.value] || 0) + 1;
    }
    const pairValue = Object.keys(counts).find(v => counts[v] >= 2);
    if (pairValue) {
      return `口袋对 ${pairValue}`;
    }
    const highest = [...allCards].sort((a, b) => getValueRank(b.value) - getValueRank(a.value))[0];
    return `高牌 ${highest.value}`;
  }

  // 翻牌后：完整评估
  return evaluateHand(allCards).name;
};
