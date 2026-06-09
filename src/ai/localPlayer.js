import { estimateHandStrength } from '../game/handEval';

export const localAIDecide = ({ hand, community, toCall, pot, stack, bet, style }) => {
  const handStrength = estimateHandStrength(hand, community);
  const potOdds = toCall / (pot + toCall) || 0;
  const stackToPotRatio = stack / (pot || 1);

  switch (style) {
    case 'conservative':
      return conservativeDecision(handStrength, toCall, pot, stack, bet, potOdds);
    case 'aggressive':
      return aggressiveDecision(handStrength, toCall, pot, stack, bet, potOdds, stackToPotRatio);
    case 'balanced':
      return balancedDecision(handStrength, potOdds, toCall, pot, stack, bet);
    case 'random':
      return randomDecision(toCall, pot, stack, bet, handStrength);
    case 'mathematical':
      return mathematicalDecision(handStrength, potOdds, toCall, pot, stack, bet);
    default:
      return balancedDecision(handStrength, potOdds, toCall, pot, stack, bet);
  }
};

// GTO启发式：保守型 - 紧凶风格（TAG）
const conservativeDecision = (handStrength, toCall, pot, stack, currentBet, potOdds) => {
  // 翻牌前阶段（community.length === 0）更严格
  const isPreflop = !pot || pot < 100; // 简化判断

  // 弃牌阈值：保守型需要更好的牌
  const foldThreshold = isPreflop ? 0.45 : 0.35;
  if (handStrength < foldThreshold && toCall > stack * 0.15) {
    return { action: 'fold', amount: 0 };
  }

  // 没人下注时的策略
  if (toCall === 0) {
    // 价值下注：强牌时下注约2/3底池
    if (handStrength > 0.75) {
      const raiseAmount = Math.min(Math.floor(pot * 0.65) + currentBet, stack + currentBet);
      return { action: 'raise', amount: raiseAmount };
    }

    // 半诈唬机会：中等牌力时偶尔加注
    if (handStrength > 0.55 && Math.random() < 0.3) {
      const raiseAmount = Math.min(Math.floor(pot * 0.5) + currentBet, stack + currentBet);
      return { action: 'raise', amount: raiseAmount };
    }

    return { action: 'check', amount: 0 };
  }

  // 面对下注时：根据pot odds和牌力决定
  // 强牌反加注
  if (handStrength > 0.8) {
    const raiseAmount = Math.min(Math.floor(pot * 0.75) + currentBet + toCall, stack + currentBet);
    return { action: 'raise', amount: raiseAmount };
  }

  // 跟注条件：pot odds 有利且牌力足够
  if (handStrength > potOdds && handStrength > 0.4) {
    return { action: 'call', amount: currentBet + toCall };
  }

  return { action: 'fold', amount: 0 };
};

// GTO启发式：激进型 - 松凶风格（LAG）
const aggressiveDecision = (handStrength, toCall, pot, stack, currentBet, potOdds, stackToPotRatio) => {
  // 激进型更愿意诈唬和半诈唬
  const bluffChance = 0.25;

  // 更宽松的弃牌阈值
  if (handStrength < 0.2 && toCall > stack * 0.4) {
    return { action: 'fold', amount: 0 };
  }

  // 没人下注时，频繁加注
  if (toCall === 0) {
    if (handStrength > 0.4 || Math.random() < bluffChance) {
      const aggression = 0.6 + Math.random() * 0.4; // 60%-100%底池
      const raiseAmount = Math.min(
        Math.floor(pot * aggression) + currentBet,
        stack + currentBet
      );
      return { action: 'raise', amount: raiseAmount };
    }
    return { action: 'check', amount: 0 };
  }

  // 面对下注时：强牌反加注，中等牌跟注，弱牌弃牌
  if (handStrength > 0.65) {
    // 强牌：3bet反加注
    const raiseAmount = Math.min(
      Math.floor(pot * (0.8 + Math.random() * 0.4)) + currentBet + toCall,
      stack + currentBet
    );
    return { action: 'raise', amount: raiseAmount };
  }

  // 跟注：更宽松的条件
  if (handStrength > potOdds * 0.8 || handStrength > 0.3) {
    return { action: 'call', amount: currentBet + toCall };
  }

  return { action: 'fold', amount: 0 };
};

// GTO启发式：平衡型 - 基于pot odds和implied odds
const balancedDecision = (handStrength, potOdds, toCall, pot, stack, currentBet) => {
  // 考虑隐含赔率（implied odds）
  const impliedOdds = potOdds * (1 + Math.min(stack / pot, 2) * 0.2);

  // 没人下注时的策略
  if (toCall === 0) {
    // 价值下注：强牌
    if (handStrength > 0.7) {
      const raiseAmount = Math.min(Math.floor(pot * 0.7) + currentBet, stack + currentBet);
      return { action: 'raise', amount: raiseAmount };
    }

    // 半诈唬：中等牌力，有位置优势时
    if (handStrength > 0.5 && Math.random() < 0.4) {
      const raiseAmount = Math.min(Math.floor(pot * 0.55) + currentBet, stack + currentBet);
      return { action: 'raise', amount: raiseAmount };
    }

    return { action: 'check', amount: 0 };
  }

  // 面对下注时：强牌反加注
  if (handStrength > 0.75) {
    const raiseAmount = Math.min(Math.floor(pot * 0.8) + currentBet + toCall, stack + currentBet);
    return { action: 'raise', amount: raiseAmount };
  }

  // 跟注：牌力大于隐含赔率
  if (handStrength > impliedOdds) {
    return { action: 'call', amount: currentBet + toCall };
  }

  return { action: 'fold', amount: 0 };
};

// 随机型：不可预测，但加入基本理性
const randomDecision = (toCall, pot, stack, currentBet, handStrength) => {
  const r = Math.random();

  // 极弱牌更容易弃牌
  if (handStrength < 0.2 && r < 0.4 && toCall > 0) {
    return { action: 'fold', amount: 0 };
  }

  // 随机加注
  if (r < 0.35) {
    const aggression = 0.4 + Math.random() * 0.8;
    const raiseAmount = Math.min(
      Math.floor(pot * aggression) + currentBet,
      stack + currentBet
    );
    return { action: 'raise', amount: raiseAmount };
  }

  // 随机跟注
  if (toCall > 0 && r < 0.7) {
    return { action: 'call', amount: currentBet + toCall };
  }

  if (toCall === 0) {
    return { action: 'check', amount: 0 };
  }
  return { action: 'fold', amount: 0 };
};

// GTO启发式：数学型 - 严格基于pot odds
const mathematicalDecision = (handStrength, potOdds, toCall, pot, stack, currentBet) => {
  // 没人下注时的策略
  if (toCall === 0) {
    // 强牌：最大化价值
    if (handStrength > 0.8) {
      const raiseAmount = Math.min(Math.floor(pot * 0.85) + currentBet, stack + currentBet);
      return { action: 'raise', amount: raiseAmount };
    }

    // 中强牌：适度加注
    if (handStrength > 0.65) {
      const raiseAmount = Math.min(Math.floor(pot * 0.6) + currentBet, stack + currentBet);
      return { action: 'raise', amount: raiseAmount };
    }

    return { action: 'check', amount: 0 };
  }

  // 面对下注时：严格的pot odds决策
  // 牌力不足，弃牌
  if (handStrength < potOdds) {
    return { action: 'fold', amount: 0 };
  }

  // 超强牌：反加注
  if (handStrength > 0.85) {
    const raiseAmount = Math.min(Math.floor(pot * 0.9) + currentBet + toCall, stack + currentBet);
    return { action: 'raise', amount: raiseAmount };
  }

  // 按pot odds跟注
  return { action: 'call', amount: currentBet + toCall };
};
