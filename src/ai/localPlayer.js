import { estimateHandStrength } from '../game/handEval';

export const localAIDecide = ({ hand, community, toCall, pot, stack, bet, style, stage, position, numPlayers }) => {
  const handStrength = estimateHandStrength(hand, community);
  const potOdds = toCall / (pot + toCall) || 0;
  const stackToPotRatio = stack / (pot || 1);

  switch (style) {
    case 'conservative':
      return conservativeDecision(handStrength, toCall, pot, stack, bet, potOdds);
    case 'aggressive':
      return aggressiveDecision(handStrength, toCall, pot, stack, bet, potOdds, stackToPotRatio);
    case 'balanced':
      return balancedDecision(handStrength, potOdds, toCall, pot, stack, bet, stage, position, numPlayers);
    case 'random':
      return randomDecision(toCall, pot, stack, bet, handStrength);
    case 'mathematical':
      return mathematicalDecision(handStrength, potOdds, toCall, pot, stack, bet, stage, position, numPlayers);
    default:
      return balancedDecision(handStrength, potOdds, toCall, pot, stack, bet, stage, position, numPlayers);
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
const balancedDecision = (handStrength, potOdds, toCall, pot, stack, currentBet, stage = 'PREFLOP', position = 0, numPlayers = 6) => {
  // 位置感知
  const isLatePosition = position >= Math.floor(numPlayers / 2);
  const positionBonus = isLatePosition ? 0.06 : -0.03;
  const adjustedStrength = Math.max(0, Math.min(1, handStrength + positionBonus));

  // 考虑隐含赔率（implied odds）
  const impliedOdds = potOdds * (1 + Math.min(stack / pot, 2) * 0.2);
  const effectiveOdds = impliedOdds * 0.9; // 更激进的跟注

  // 混合策略
  const randomFactor = Math.random();

  // 没人下注时的策略
  if (toCall === 0) {
    // 超强牌：65% 加注，35% 慢打
    if (adjustedStrength > 0.82) {
      if (randomFactor < 0.65) {
        const raiseAmount = Math.min(Math.floor(pot * 0.7) + currentBet, stack + currentBet);
        return { action: 'raise', amount: raiseAmount };
      }
      return { action: 'check', amount: 0 };
    }

    // 强牌：55% 加注
    if (adjustedStrength > 0.68) {
      if (randomFactor < 0.55) {
        const raiseAmount = Math.min(Math.floor(pot * 0.6) + currentBet, stack + currentBet);
        return { action: 'raise', amount: raiseAmount };
      }
      return { action: 'check', amount: 0 };
    }

    // 中等牌：后位 30% 半诈唬加注
    if (adjustedStrength > 0.45 && isLatePosition && randomFactor < 0.3) {
      const raiseAmount = Math.min(Math.floor(pot * 0.5) + currentBet, stack + currentBet);
      return { action: 'raise', amount: raiseAmount };
    }

    // 弱牌：后位 flop/turn 18% 诈唬
    if (isLatePosition && stage !== 'RIVER' && randomFactor < 0.18 && adjustedStrength > 0.25) {
      const raiseAmount = Math.min(Math.floor(pot * 0.55) + currentBet, stack + currentBet);
      return { action: 'raise', amount: raiseAmount };
    }

    return { action: 'check', amount: 0 };
  }

  // 面对下注时
  // 超强牌：70% 加注，30% 跟注
  if (adjustedStrength > 0.85) {
    if (randomFactor < 0.7) {
      const raiseAmount = Math.min(Math.floor(pot * 0.9) + currentBet + toCall, stack + currentBet);
      return { action: 'raise', amount: raiseAmount };
    }
    return { action: 'call', amount: currentBet + toCall };
  }

  // 强牌：45% 加注，55% 跟注
  if (adjustedStrength > 0.73) {
    if (randomFactor < 0.45) {
      const raiseAmount = Math.min(Math.floor(pot * 0.8) + currentBet + toCall, stack + currentBet);
      return { action: 'raise', amount: raiseAmount };
    }
    return { action: 'call', amount: currentBet + toCall };
  }

  // 中上牌：隐含赔率范围跟注
  if (adjustedStrength > effectiveOdds + 0.08) {
    return { action: 'call', amount: currentBet + toCall };
  }

  // 中等牌：后位 20% 诈唬加注
  if (adjustedStrength > effectiveOdds - 0.05 && isLatePosition && randomFactor < 0.2 && stage !== 'RIVER') {
    const raiseAmount = Math.min(Math.floor(pot * 0.75) + currentBet + toCall, stack + currentBet);
    return { action: 'raise', amount: raiseAmount };
  }

  // 边缘跟注
  if (adjustedStrength > effectiveOdds - 0.03) {
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

// GTO启发式：数学型 - 严格基于pot odds + 位置感知 + 混合策略 + 诈唬
const mathematicalDecision = (handStrength, potOdds, toCall, pot, stack, currentBet, stage = 'PREFLOP', position = 0, numPlayers = 6) => {
  // 位置权重：后位（button）更激进，早位更谨慎
  const isLatePosition = position >= Math.floor(numPlayers / 2);
  const positionBonus = isLatePosition ? 0.08 : -0.05;
  const adjustedStrength = Math.max(0, Math.min(1, handStrength + positionBonus));

  // 阶段调整：river 更谨慎，flop 更激进
  const stageMultiplier = {
    'PREFLOP': 1.0,
    'FLOP': 1.15,    // flop 更激进（信息不完整，施压有效）
    'TURN': 1.0,
    'RIVER': 0.9     // river 更谨慎（所有牌已出，价值明确）
  }[stage] || 1.0;

  // 混合策略：引入随机性，避免被对手预测
  const randomFactor = Math.random();

  // 没人下注时的策略
  if (toCall === 0) {
    // 超强牌：70% 加注，30% 慢打（check）
    if (adjustedStrength > 0.85) {
      if (randomFactor < 0.7) {
        const raiseAmount = Math.min(Math.floor(pot * 0.75 * stageMultiplier) + currentBet, stack + currentBet);
        return { action: 'raise', amount: raiseAmount };
      }
      return { action: 'check', amount: 0 }; // 慢打设陷阱
    }

    // 强牌：60% 加注（价值下注），40% check
    if (adjustedStrength > 0.7) {
      if (randomFactor < 0.6) {
        const raiseAmount = Math.min(Math.floor(pot * 0.55 * stageMultiplier) + currentBet, stack + currentBet);
        return { action: 'raise', amount: raiseAmount };
      }
      return { action: 'check', amount: 0 };
    }

    // 中等牌：20% 加注（诈唬），80% check
    if (adjustedStrength > 0.4) {
      if (randomFactor < 0.2 && isLatePosition) {
        const raiseAmount = Math.min(Math.floor(pot * 0.5) + currentBet, stack + currentBet);
        return { action: 'raise', amount: raiseAmount };
      }
      return { action: 'check', amount: 0 };
    }

    // 弱牌：后位 15% 诈唬加注，否则 check
    if (randomFactor < 0.15 && isLatePosition && stage !== 'RIVER') {
      const raiseAmount = Math.min(Math.floor(pot * 0.6) + currentBet, stack + currentBet);
      return { action: 'raise', amount: raiseAmount };
    }
    return { action: 'check', amount: 0 };
  }

  // 面对下注时：GTO 混合防守策略
  const effectivePotOdds = potOdds * 0.85; // 降低弃牌阈值（更激进）

  // 超强牌：80% 加注，20% 跟注（平衡范围）
  if (adjustedStrength > 0.88) {
    if (randomFactor < 0.8) {
      const raiseAmount = Math.min(Math.floor(pot * 1.2 * stageMultiplier) + currentBet + toCall, stack + currentBet);
      return { action: 'raise', amount: raiseAmount };
    }
    return { action: 'call', amount: currentBet + toCall };
  }

  // 强牌：55% 加注（价值+保护），45% 跟注
  if (adjustedStrength > 0.75) {
    if (randomFactor < 0.55) {
      const raiseAmount = Math.min(Math.floor(pot * 0.9 * stageMultiplier) + currentBet + toCall, stack + currentBet);
      return { action: 'raise', amount: raiseAmount };
    }
    return { action: 'call', amount: currentBet + toCall };
  }

  // 中上牌：pot odds + 隐含赔率，跟注范围
  if (adjustedStrength > effectivePotOdds + 0.1) {
    return { action: 'call', amount: currentBet + toCall };
  }

  // 中等牌：pot odds 边缘，后位有 25% 诈唬加注
  if (adjustedStrength > effectivePotOdds - 0.08) {
    if (randomFactor < 0.25 && isLatePosition && stage !== 'RIVER') {
      const raiseAmount = Math.min(Math.floor(pot * 0.8) + currentBet + toCall, stack + currentBet);
      return { action: 'raise', amount: raiseAmount };
    }
    // 勉强跟注（隐含赔率）
    if (adjustedStrength > effectivePotOdds - 0.05) {
      return { action: 'call', amount: currentBet + toCall };
    }
  }

  // 弱牌：10% 纯诈唬（后位 flop/turn），其余弃牌
  if (randomFactor < 0.1 && isLatePosition && stage !== 'RIVER' && toCall < pot * 0.5) {
    const raiseAmount = Math.min(Math.floor(pot * 0.7) + currentBet + toCall, stack + currentBet);
    return { action: 'raise', amount: raiseAmount };
  }

  return { action: 'fold', amount: 0 };
};
