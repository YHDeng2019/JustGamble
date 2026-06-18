// 斗牛（牛牛）游戏引擎 v2
// 规则：牛牛（剩两张个位=0）=最高普通牌，启用五花牛/炸弹/五小牛
// 倍数：没牛~牛六=1x，牛七/八/九=2x，牛牛=3x，五小牛=5x，炸弹=5x，五花牛=5x
// 结算：底池模式 —— 输家先放入（下注×倍数），赢家按牌面大到小依次从底池取钱

const SUITS = ['♠', '♥', '♦', '♣'];
const VALUES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const BANKER_ANTE = 200;   // 庄家每局入底池金额
export const BASE_BET = 100;      // 闲家基础下注
export const INIT_CHIPS = 1000;
export const BANKER_MIN_CHIPS = BANKER_ANTE; // 做庄最低筹码要求
export const BANKER_MAX_ROUNDS = 3;  // 连庄超过这么多局可选择主动转庄

// 牌面点数（A=1，J/Q/K=10）
function cardPoint(value) {
  if (value === 'A') return 1;
  if (['J', 'Q', 'K'].includes(value)) return 10;
  return parseInt(value);
}

// 同牌型二级比较：比最大单张，A最大
const VALUE_RANK = { A: 14, K: 13, Q: 12, J: 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2 };
function cardRank(value) { return VALUE_RANK[value] || 0; }

export function createDeck() {
  const deck = [];
  for (const suit of SUITS)
    for (const value of VALUES)
      deck.push({ suit, value, point: cardPoint(value), id: `${suit}${value}` });
  return shuffle(deck);
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function dealHands(playerCount) {
  const deck = createDeck();
  return Array.from({ length: playerCount }, (_, i) => deck.slice(i * 5, i * 5 + 5));
}

// C(5,3)
function combinations3(cards) {
  const r = [];
  for (let i = 0; i < 3; i++)
    for (let j = i + 1; j < 4; j++)
      for (let k = j + 1; k < 5; k++)
        r.push([cards[i], cards[j], cards[k]]);
  return r;
}

function isBomb(cards) {
  const counts = {};
  for (const c of cards) counts[c.value] = (counts[c.value] || 0) + 1;
  return Object.values(counts).some(v => v >= 4);
}

function isWuHuaNiu(cards) {
  return cards.every(c => ['J', 'Q', 'K'].includes(c.value));
}

function isWuXiaoNiu(cards) {
  const pts = cards.map(c => c.point);
  return pts.every(p => p <= 5) && pts.reduce((a, b) => a + b, 0) % 10 === 0;
}

// 牌型级别（越大越强）
export const HAND_RANK = {
  NO_NIU:     0,
  NIU_1: 1, NIU_2: 2, NIU_3: 3, NIU_4: 4,
  NIU_5: 5, NIU_6: 6, NIU_7: 7, NIU_8: 8, NIU_9: 9,
  NIU_NIU:    10,  // 牛牛（剩两张点数之和 % 10 === 0）
  WU_XIAO_NIU: 11,
  BOMB:        12,
  WU_HUA_NIU:  13,
};

export const HAND_NAMES = {
  [HAND_RANK.NO_NIU]:      '没牛',
  [HAND_RANK.NIU_1]:       '牛一',
  [HAND_RANK.NIU_2]:       '牛二',
  [HAND_RANK.NIU_3]:       '牛三',
  [HAND_RANK.NIU_4]:       '牛四',
  [HAND_RANK.NIU_5]:       '牛五',
  [HAND_RANK.NIU_6]:       '牛六',
  [HAND_RANK.NIU_7]:       '牛七',
  [HAND_RANK.NIU_8]:       '牛八',
  [HAND_RANK.NIU_9]:       '牛九',
  [HAND_RANK.NIU_NIU]:     '牛牛',
  [HAND_RANK.WU_XIAO_NIU]:'五小牛',
  [HAND_RANK.BOMB]:        '炸弹',
  [HAND_RANK.WU_HUA_NIU]: '五花牛',
};

// 倍数：输赢双方取 max(自己倍数, 对方倍数)
export const MULTIPLIERS = {
  [HAND_RANK.NO_NIU]: 1,
  [HAND_RANK.NIU_1]:  1, [HAND_RANK.NIU_2]: 1, [HAND_RANK.NIU_3]: 1,
  [HAND_RANK.NIU_4]:  1, [HAND_RANK.NIU_5]: 1, [HAND_RANK.NIU_6]: 1,
  [HAND_RANK.NIU_7]:  2, [HAND_RANK.NIU_8]: 2, [HAND_RANK.NIU_9]: 2,
  [HAND_RANK.NIU_NIU]: 3,
  [HAND_RANK.WU_XIAO_NIU]: 5,
  [HAND_RANK.BOMB]:         5,
  [HAND_RANK.WU_HUA_NIU]:  5,
};

export function isSpecialHand(rank) {
  return rank >= HAND_RANK.WU_XIAO_NIU;
}

// 核心判型
export function evaluateHand(cards) {
  if (isWuHuaNiu(cards)) return { rank: HAND_RANK.WU_HUA_NIU, name: HAND_NAMES[HAND_RANK.WU_HUA_NIU], cards };
  if (isBomb(cards))     return { rank: HAND_RANK.BOMB, name: HAND_NAMES[HAND_RANK.BOMB], cards };
  if (isWuXiaoNiu(cards)) return { rank: HAND_RANK.WU_XIAO_NIU, name: HAND_NAMES[HAND_RANK.WU_XIAO_NIU], cards };

  const combos = combinations3(cards);
  let bestNiu = -1;
  for (const three of combos) {
    const sum3 = three.reduce((a, c) => a + c.point, 0);
    if (sum3 % 10 === 0) {
      const twoIds = new Set(three.map(c => c.id));
      const remaining = cards.filter(c => !twoIds.has(c.id));
      const niuVal = remaining.reduce((a, c) => a + c.point, 0) % 10;
      // 个位 0 = 牛牛（rank 10）
      const effective = niuVal === 0 ? HAND_RANK.NIU_NIU : niuVal;
      if (effective > bestNiu) bestNiu = effective;
    }
  }

  if (bestNiu === -1) return { rank: HAND_RANK.NO_NIU, name: HAND_NAMES[HAND_RANK.NO_NIU], cards };
  return { rank: bestNiu, name: HAND_NAMES[bestNiu], cards };
}

// 比较两手牌：1 = a赢，-1 = b赢，0 = 平
export function compareHands(a, b) {
  if (a.rank !== b.rank) return a.rank > b.rank ? 1 : -1;
  const maxR = (res) => Math.max(...res.cards.map(c => cardRank(c.value)));
  const ma = maxR(a), mb = maxR(b);
  if (ma !== mb) return ma > mb ? 1 : -1;
  return 0;
}

/**
 * 底池结算
 *
 * 规则：
 * 1. 庄家放 BANKER_ANTE 进底池
 * 2. 闲家与庄家比牌，输的闲家放入 bet × mult（输赢方 mult 取大值）进底池
 * 3. 赢的闲家按牌面从大到小依次从底池取出 bet × mult，取不到算损失
 * 4. 最终底池剩余归庄家
 *
 * @param {number}   bankerIndex  - 庄家在 players 数组中的下标
 * @param {object[]} handResults  - evaluateHand 结果数组，与 players 对应
 * @param {number[]} bets         - 每位闲家的下注额（bankerIndex 位置忽略）
 * @param {number[]} chips        - 每位玩家当前筹码（用于约束实际能放入的金额）
 *
 * @returns {{ changes: number[], poolRemaining: number, settlements: object[] }}
 *   changes: 每位玩家筹码变化（正=赢，负=输）
 *   poolRemaining: 本局结束后底池剩余（转给庄家）
 *   settlements: 详细结算记录 [{ playerId, action, amount, pool }]
 */
export function settleWithPool(bankerIndex, handResults, bets, chips) {
  const n = handResults.length;
  const changes = new Array(n).fill(0);
  const settlements = [];
  const bankerResult = handResults[bankerIndex];

  // 庄家先入底池
  let pool = BANKER_ANTE;
  changes[bankerIndex] -= BANKER_ANTE;
  settlements.push({ idx: bankerIndex, action: 'ante', amount: BANKER_ANTE, pool });

  // 收集每位闲家的比牌结果
  const losers = [];
  const winners = [];

  for (let i = 0; i < n; i++) {
    if (i === bankerIndex) continue;
    const playerResult = handResults[i];
    const cmp = compareHands(playerResult, bankerResult);
    const mult = Math.max(MULTIPLIERS[playerResult.rank], MULTIPLIERS[bankerResult.rank]);
    const bet = bets[i];
    const amount = bet * mult;

    if (cmp < 0) {
      // 闲家输：放入 amount，但不超过自身筹码
      const actualAmount = Math.min(amount, chips[i]);
      losers.push({ idx: i, amount: actualAmount, mult });
    } else if (cmp > 0) {
      // 闲家赢：按排面大到小记录（后面排序后依次取）
      winners.push({ idx: i, amount, rank: playerResult.rank, maxCard: Math.max(...playerResult.cards.map(c => cardRank(c.value))), mult });
    }
    // 平局：不放不取
  }

  // Step 1: 输家依次放入底池
  for (const loser of losers) {
    pool += loser.amount;
    changes[loser.idx] -= loser.amount;
    settlements.push({ idx: loser.idx, action: 'lose', amount: loser.amount, pool });
  }

  // Step 2: 赢家按牌面大到小依次从底池取
  winners.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    return b.maxCard - a.maxCard;
  });

  for (const winner of winners) {
    const take = Math.min(winner.amount, pool);
    pool -= take;
    changes[winner.idx] += take;
    settlements.push({ idx: winner.idx, action: 'win', amount: take, requested: winner.amount, pool });
  }

  // Step 3: 底池剩余归庄家
  if (pool > 0) {
    changes[bankerIndex] += pool;
    settlements.push({ idx: bankerIndex, action: 'pool_remaining', amount: pool, pool: 0 });
  }

  return { changes, poolRemaining: pool, settlements };
}

// AI 下注决策：随机 1~3 倍
export function aiDecideBet(baseBet, chips) {
  const maxMult = Math.min(3, Math.floor(chips / baseBet));
  const mult = Math.max(1, Math.floor(Math.random() * maxMult) + 1);
  return Math.min(baseBet * mult, chips);
}

// 找下一个有资格做庄的玩家（筹码 >= BANKER_ANTE）
export function findNextBanker(players, currentBankerIndex) {
  const n = players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (currentBankerIndex + i) % n;
    if (players[idx].chips >= BANKER_ANTE) return idx;
  }
  return -1; // 所有人都没钱了
}
