// 斗牛（牛牛）游戏引擎
// 规则：牛十=老牛（特殊牌型，高于牛九），启用五花牛/炸弹/五小牛，同牌型比最大单张

const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// 牌面点数（斗牛规则：A=1，J/Q/K=10）
function cardPoint(value) {
  if (value === 'A') return 1;
  if (['J', 'Q', 'K'].includes(value)) return 10;
  return parseInt(value);
}

// 牌的大小比较（用于同牌型二级比较，A最大，K次之）
const VALUE_RANK = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
function cardRank(value) { return VALUE_RANK[value] || 0; }

export function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value, point: cardPoint(value), id: `${suit}${value}` });
    }
  }
  return shuffle(deck);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 从牌组中发 count 张给每位玩家
export function dealHands(playerCount) {
  const deck = createDeck();
  const hands = [];
  for (let i = 0; i < playerCount; i++) {
    hands.push(deck.slice(i * 5, i * 5 + 5));
  }
  return hands;
}

// C(5,3) 全部组合
function combinations3(cards) {
  const result = [];
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 4; j++)
      for (let k = j + 1; k < 5; k++)
        result.push([cards[i], cards[j], cards[k]]);
  return result;
}

// 判断特殊牌型
function isBomb(cards) {
  const counts = {};
  for (const c of cards) counts[c.value] = (counts[c.value] || 0) + 1;
  return Object.values(counts).some(v => v >= 4);
}

function isWuHuaNiu(cards) {
  return cards.every(c => ['J', 'Q', 'K'].includes(c.value));
}

function isWuXiaoNiu(cards) {
  // 5张点数全在1-5之间（A=1, 2-5），且总和能被10整除
  const pts = cards.map(c => c.point);
  return pts.every(p => p <= 5) && pts.reduce((a, b) => a + b, 0) % 10 === 0;
}

// 牌型级别常量（越大越强）
export const HAND_RANK = {
  NO_NIU: 0,     // 没牛
  NIU_1: 1, NIU_2: 2, NIU_3: 3, NIU_4: 4, NIU_5: 5,
  NIU_6: 6, NIU_7: 7, NIU_8: 8, NIU_9: 9,
  NIU_10: 10,    // 老牛（牛十）
  WU_XIAO_NIU: 11, // 五小牛
  BOMB: 12,      // 炸弹
  WU_HUA_NIU: 13 // 五花牛
};

export const HAND_NAMES = {
  [HAND_RANK.NO_NIU]: '没牛',
  [HAND_RANK.NIU_1]: '牛一', [HAND_RANK.NIU_2]: '牛二', [HAND_RANK.NIU_3]: '牛三',
  [HAND_RANK.NIU_4]: '牛四', [HAND_RANK.NIU_5]: '牛五', [HAND_RANK.NIU_6]: '牛六',
  [HAND_RANK.NIU_7]: '牛七', [HAND_RANK.NIU_8]: '牛八', [HAND_RANK.NIU_9]: '牛九',
  [HAND_RANK.NIU_10]: '老牛', [HAND_RANK.WU_XIAO_NIU]: '五小牛',
  [HAND_RANK.BOMB]: '炸弹', [HAND_RANK.WU_HUA_NIU]: '五花牛',
};

// 特殊牌型的赔率倍数
export const MULTIPLIERS = {
  [HAND_RANK.NO_NIU]: 1, [HAND_RANK.NIU_1]: 1, [HAND_RANK.NIU_2]: 1,
  [HAND_RANK.NIU_3]: 1, [HAND_RANK.NIU_4]: 1, [HAND_RANK.NIU_5]: 1,
  [HAND_RANK.NIU_6]: 1, [HAND_RANK.NIU_7]: 1, [HAND_RANK.NIU_8]: 1,
  [HAND_RANK.NIU_9]: 1, [HAND_RANK.NIU_10]: 1,
  [HAND_RANK.WU_XIAO_NIU]: 3, [HAND_RANK.BOMB]: 4, [HAND_RANK.WU_HUA_NIU]: 5,
};

// 核心：计算牌型
export function evaluateHand(cards) {
  // 特殊牌型优先
  if (isWuHuaNiu(cards)) return { rank: HAND_RANK.WU_HUA_NIU, name: HAND_NAMES[HAND_RANK.WU_HUA_NIU], cards };
  if (isBomb(cards)) return { rank: HAND_RANK.BOMB, name: HAND_NAMES[HAND_RANK.BOMB], cards };
  if (isWuXiaoNiu(cards)) return { rank: HAND_RANK.WU_XIAO_NIU, name: HAND_NAMES[HAND_RANK.WU_XIAO_NIU], cards };

  // 普通牛几：遍历 C(5,3) 找最大牛值
  const combos = combinations3(cards);
  let bestNiu = -1;
  for (const three of combos) {
    const sum3 = three.reduce((a, c) => a + c.point, 0);
    if (sum3 % 10 === 0) {
      const twoIds = new Set(three.map(c => c.id));
      const remaining = cards.filter(c => !twoIds.has(c.id));
      const niuVal = remaining.reduce((a, c) => a + c.point, 0) % 10;
      // 牛十（个位0）作为老牛处理，值为10
      const effective = niuVal === 0 ? 10 : niuVal;
      if (effective > bestNiu) bestNiu = effective;
    }
  }

  if (bestNiu === -1) return { rank: HAND_RANK.NO_NIU, name: HAND_NAMES[HAND_RANK.NO_NIU], cards };

  const rank = bestNiu; // NIU_1~NIU_10 == 1~10
  return { rank, name: HAND_NAMES[rank], cards };
}

// 比较两手牌，返回 1（a赢）/ -1（b赢）/ 0（平）
export function compareHands(resultA, resultB) {
  if (resultA.rank !== resultB.rank) {
    return resultA.rank > resultB.rank ? 1 : -1;
  }
  // 同牌型：比最大单张点数（用牌面等级，A最大）
  const maxRankOf = (res) => Math.max(...res.cards.map(c => cardRank(c.value)));
  const ma = maxRankOf(resultA);
  const mb = maxRankOf(resultB);
  if (ma !== mb) return ma > mb ? 1 : -1;
  return 0; // 完全平局，庄家不赢不输
}

// 庄家模式结算：返回每位玩家的筹码变化
export function settle(bankerIndex, handResults, bets) {
  const n = handResults.length;
  const changes = new Array(n).fill(0);
  const bankerResult = handResults[bankerIndex];
  const bankerMult = MULTIPLIERS[bankerResult.rank];

  for (let i = 0; i < n; i++) {
    if (i === bankerIndex) continue;
    const playerResult = handResults[i];
    const playerMult = MULTIPLIERS[playerResult.rank];
    const cmp = compareHands(playerResult, bankerResult);
    const bet = bets[i];

    if (cmp > 0) {
      // 闲家赢：庄家按max(playerMult, bankerMult)倍赔付
      const mult = Math.max(playerMult, bankerMult);
      changes[i] = bet * mult;
      changes[bankerIndex] -= bet * mult;
    } else if (cmp < 0) {
      // 庄家赢：闲家按max(playerMult, bankerMult)倍赔付
      const mult = Math.max(playerMult, bankerMult);
      changes[i] = -bet * mult;
      changes[bankerIndex] += bet * mult;
    }
    // 平局不结算
  }
  return changes;
}

// AI 简单决策：随机下注（1~3倍基础注）
export function aiDecideBet(baseBet) {
  const mult = Math.floor(Math.random() * 3) + 1;
  return baseBet * mult;
}
