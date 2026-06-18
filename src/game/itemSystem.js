import { dealCard } from './deck';

// 道具购买费用（单位：BB倍数）
export const ITEM_COSTS = {
  replace_hand:      5,
  peek_next:         5,
  peek_opponent:     8,
  swap_hand:         8,
  replace_community: 10,
  force_show:        10,
  shield:            12,
};

// 固定价格道具（不随大盲注缩放）
export const ITEM_FLAT_COSTS = {
  shield: 100,
};

// 统一费用计算：优先使用固定价格，否则 BB 倍数
export function getItemCost(itemId, bigBlind) {
  if (ITEM_FLAT_COSTS[itemId] !== undefined) return ITEM_FLAT_COSTS[itemId];
  return (ITEM_COSTS[itemId] || 5) * bigBlind;
}

export const ITEMS = {
  swap_hand: {
    id: 'swap_hand',
    name: '换牌协议',
    icon: '/icons/items/swap_hand.svg',
    emoji: '🔀',
    desc: '与指定玩家各随机交换一张手牌',
    type: 'change',
    needsTarget: true,
    stages: ['PRE_FLOP', 'FLOP', 'TURN']
  },
  peek_next: {
    id: 'peek_next',
    name: '天眼',
    icon: '/icons/items/peek_next.svg',
    emoji: '👁',
    desc: '偷看下一张待翻的公共牌（仅自己可见）',
    type: 'info',
    needsTarget: false,
    stages: ['PRE_FLOP', 'FLOP', 'TURN']
  },
  peek_opponent: {
    id: 'peek_opponent',
    name: '读心术',
    icon: '/icons/items/peek_opponent.svg',
    emoji: '🔮',
    desc: '查看指定对手一张手牌（仅自己可见 3 秒）',
    type: 'info',
    needsTarget: true,
    stages: ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER']
  },
  replace_hand: {
    id: 'replace_hand',
    name: '手气不错',
    icon: '/icons/items/replace_hand.svg',
    emoji: '🎲',
    desc: '随机换掉自己一张手牌（从牌堆抽新牌）',
    type: 'change',
    needsTarget: false,
    stages: ['PRE_FLOP']
  },
  replace_community: {
    id: 'replace_community',
    name: '天意弄人',
    icon: '/icons/items/replace_community.svg',
    emoji: '🌀',
    desc: '随机换掉一张已翻出的公共牌',
    type: 'change',
    needsTarget: false,
    stages: ['FLOP', 'TURN', 'RIVER']
  },
  shield: {
    id: 'shield',
    name: '免死金牌',
    icon: '/icons/items/shield.svg',
    emoji: '🛡',
    desc: '若本局输牌，退还净损失的 50%',
    type: 'chip',
    needsTarget: false,
    stages: ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER']
  },
  force_show: {
    id: 'force_show',
    name: '摊底',
    icon: '/icons/items/force_show.svg',
    emoji: '🃏',
    desc: '强制指定对手摊开一张手牌给全桌看 3 秒',
    type: 'info',
    needsTarget: true,
    stages: ['PRE_FLOP', 'FLOP', 'TURN', 'RIVER']
  }
};

const ITEM_IDS = Object.keys(ITEMS);

export function drawRandomItem() {
  return ITEM_IDS[Math.floor(Math.random() * ITEM_IDS.length)];
}

export function getRefreshCost(refreshCount, bigBlind) {
  const n = refreshCount + 1;
  return Math.min(5 * n * bigBlind, 50 * bigBlind);
}

/**
 * 执行道具效果（房主侧调用）
 * @returns {{ success: boolean, effectData: object, error?: string }}
 */
export function executeItem(engine, itemId, userId, targetId) {
  const item = ITEMS[itemId];
  if (!item) return { success: false, error: '未知道具' };

  const user = engine.players.find(p => p.id === userId);
  if (!user) return { success: false, error: '玩家不存在' };

  switch (itemId) {
    case 'swap_hand': {
      const target = engine.players.find(p => p.id === targetId);
      if (!target || !target.hand || target.hand.length < 1) {
        return { success: false, error: '无效目标' };
      }
      const userCardIdx = Math.floor(Math.random() * user.hand.length);
      const targetCardIdx = Math.floor(Math.random() * target.hand.length);
      const tmp = user.hand[userCardIdx];
      user.hand[userCardIdx] = target.hand[targetCardIdx];
      target.hand[targetCardIdx] = tmp;
      return {
        success: true,
        effectData: {
          type: 'swap_hand',
          userId,
          targetId,
          userCardIdx,
          targetCardIdx
        }
      };
    }

    case 'peek_next': {
      if (!engine.deck || engine.deck.length === 0) {
        return { success: false, error: '牌堆已空' };
      }
      const nextCard = engine.deck[engine.deck.length - 1];
      // 效果数据仅传给使用者，不广播给所有人
      return {
        success: true,
        effectData: {
          type: 'peek_next',
          userId,
          privateToUser: true,
          card: nextCard
        }
      };
    }

    case 'peek_opponent': {
      const target = engine.players.find(p => p.id === targetId);
      if (!target || !target.hand || target.hand.length < 1) {
        return { success: false, error: '无效目标' };
      }
      const cardIdx = Math.floor(Math.random() * target.hand.length);
      return {
        success: true,
        effectData: {
          type: 'peek_opponent',
          userId,
          targetId,
          privateToUser: true,
          card: target.hand[cardIdx],
          targetName: target.name
        }
      };
    }

    case 'replace_hand': {
      if (!engine.deck || engine.deck.length === 0) {
        return { success: false, error: '牌堆已空' };
      }
      const cardIdx = Math.floor(Math.random() * user.hand.length);
      const oldCard = user.hand[cardIdx];
      const newCard = dealCard(engine.deck);
      user.hand[cardIdx] = newCard;
      return {
        success: true,
        effectData: {
          type: 'replace_hand',
          userId,
          cardIdx,
          oldCard,
          newCard
        }
      };
    }

    case 'replace_community': {
      if (!engine.communityCards || engine.communityCards.length === 0) {
        return { success: false, error: '当前无公共牌' };
      }
      if (!engine.deck || engine.deck.length === 0) {
        return { success: false, error: '牌堆已空' };
      }
      const communityIdx = Math.floor(Math.random() * engine.communityCards.length);
      const oldCommunity = engine.communityCards[communityIdx];
      const newCommunity = dealCard(engine.deck);
      engine.communityCards[communityIdx] = newCommunity;
      return {
        success: true,
        effectData: {
          type: 'replace_community',
          userId,
          communityIdx,
          oldCard: oldCommunity,
          newCard: newCommunity
        }
      };
    }

    case 'shield': {
      // shield 效果在结算时处理，这里只做标记
      user.shieldActive = true;
      return {
        success: true,
        effectData: {
          type: 'shield',
          userId
        }
      };
    }

    case 'force_show': {
      const target = engine.players.find(p => p.id === targetId);
      if (!target || !target.hand || target.hand.length < 1) {
        return { success: false, error: '无效目标' };
      }
      const cardIdx = Math.floor(Math.random() * target.hand.length);
      return {
        success: true,
        effectData: {
          type: 'force_show',
          userId,
          targetId,
          targetName: target.name,
          card: target.hand[cardIdx],
          cardIdx,
          durationMs: 3000
        }
      };
    }

    default:
      return { success: false, error: '未知道具' };
  }
}

/**
 * 应用 shield 结算：若玩家输牌且 shieldActive，退还净损失的 50%
 * 在 distributeWinners 之后调用
 */
export function applyShieldSettlement(players) {
  players.forEach(p => {
    if (p.shieldActive) {
      const loss = (p.roundStartChips || 0) - p.chips;
      if (loss > 0) {
        const refund = Math.floor(loss * 0.5);
        p.chips += refund;
        p.shieldRefund = refund;
      }
      p.shieldActive = false;
    }
  });
}

/**
 * 为每位玩家分配初始道具（每局开始时调用）
 */
export function dealItemsToPlayers(playerIds) {
  const playerItems = {};
  playerIds.forEach(id => {
    playerItems[id] = {
      item: drawRandomItem(),
      used: false,
      refreshCount: 0,
      refreshCost: 0 // 将在获取实际 bigBlind 后计算
    };
  });
  return playerItems;
}

/**
 * 抽取 count 张不重复的道具作为商店展示
 */
export function drawShopOffers(count = 3) {
  const pool = [...ITEM_IDS];
  const result = [];
  while (result.length < count && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
}

/**
 * 为每位玩家生成各自的商店展示道具
 */
export function generateShopOffersForPlayers(playerIds, count = 3) {
  const offers = {};
  playerIds.forEach(id => {
    offers[id] = drawShopOffers(count);
  });
  return offers;
}

/**
 * AI 自动决策是否购买道具
 * @returns itemId（购买）或 null（跳过）
 */
export function aiDecideShopPurchase(player, shopItems, bigBlind) {
  const { style, chips } = player;
  const initialChips = player.roundStartChips || chips;

  const STYLE_CONFIG = {
    conservative: { buyChance: 0.30, preferred: ['shield'] },
    aggressive:   { buyChance: 0.70, preferred: ['swap_hand', 'force_show'] },
    balanced:     { buyChance: 0.50, preferred: [] },
    random:       { buyChance: 0.40, preferred: [] },
    mathematical: { preferred: ['peek_next', 'peek_opponent'], chipThreshold: 1.2 },
  };

  const config = STYLE_CONFIG[style] || STYLE_CONFIG.balanced;

  if (style === 'mathematical') {
    if (chips < initialChips * (config.chipThreshold || 1.2)) return null;
  } else {
    if (Math.random() > (config.buyChance || 0.5)) return null;
  }

  // 过滤买得起的道具
  const affordable = shopItems.filter(id => {
    const cost = getItemCost(id, bigBlind);
    return chips >= cost;
  });
  if (affordable.length === 0) return null;

  const preferred = affordable.find(id => (config.preferred || []).includes(id));
  if (preferred) return preferred;

  return affordable[Math.floor(Math.random() * affordable.length)];
}
