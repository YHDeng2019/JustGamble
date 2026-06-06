import { estimateHandStrength } from '../game/handEval';

export const localAIDecide = ({ hand, community, toCall, pot, stack, bet, style }) => {
  const handStrength = estimateHandStrength(hand, community);
  const potOdds = toCall / (pot + toCall) || 0;

  switch (style) {
    case 'conservative':
      return conservativeDecision(handStrength, toCall, pot, stack, bet);
    case 'aggressive':
      return aggressiveDecision(handStrength, toCall, pot, stack, bet);
    case 'balanced':
      return balancedDecision(handStrength, potOdds, toCall, pot, stack, bet);
    case 'random':
      return randomDecision(toCall, pot, stack, bet);
    case 'mathematical':
      return mathematicalDecision(handStrength, potOdds, toCall, pot, stack, bet);
    default:
      return balancedDecision(handStrength, potOdds, toCall, pot, stack, bet);
  }
};

const conservativeDecision = (handStrength, toCall, pot, stack, currentBet) => {
  if (handStrength < 0.4 && toCall > 0) {
    return { action: 'fold', amount: 0 };
  }
  if (handStrength > 0.7 && toCall === 0) {
    const raiseAmount = Math.min(Math.floor(pot * 0.75) + currentBet, stack + currentBet);
    return { action: 'raise', amount: raiseAmount };
  }
  if (toCall > 0) {
    return { action: 'call', amount: currentBet + toCall };
  }
  return { action: 'check', amount: 0 };
};

const aggressiveDecision = (handStrength, toCall, pot, stack, currentBet) => {
  if (handStrength < 0.25 && toCall > stack * 0.3) {
    return { action: 'fold', amount: 0 };
  }
  if (Math.random() < 0.35 || handStrength > 0.5) {
    const raiseAmount = Math.min(
      Math.floor(pot * (0.5 + Math.random() * 0.5)) + currentBet,
      stack + currentBet
    );
    return { action: 'raise', amount: raiseAmount };
  }
  if (toCall > 0) {
    return { action: 'call', amount: currentBet + toCall };
  }
  return { action: 'check', amount: 0 };
};

const balancedDecision = (handStrength, potOdds, toCall, pot, stack, currentBet) => {
  if (handStrength < potOdds && toCall > 0) {
    return { action: 'fold', amount: 0 };
  }
  if (handStrength > 0.65) {
    const raiseAmount = Math.min(Math.floor(pot * 0.6) + currentBet, stack + currentBet);
    return { action: 'raise', amount: raiseAmount };
  }
  if (toCall > 0) {
    return { action: 'call', amount: currentBet + toCall };
  }
  return { action: 'check', amount: 0 };
};

const randomDecision = (toCall, pot, stack, currentBet) => {
  const r = Math.random();
  if (r < 0.2 && toCall > 0) {
    return { action: 'fold', amount: 0 };
  }
  if (r < 0.45) {
    const raiseAmount = Math.min(
      Math.floor(pot * (0.3 + Math.random() * 0.7)) + currentBet,
      stack + currentBet
    );
    return { action: 'raise', amount: raiseAmount };
  }
  if (toCall > 0) {
    return { action: 'call', amount: currentBet + toCall };
  }
  return { action: 'check', amount: 0 };
};

const mathematicalDecision = (handStrength, potOdds, toCall, pot, stack, currentBet) => {
  if (handStrength <= potOdds && toCall > 0) {
    return { action: 'fold', amount: 0 };
  }
  if (handStrength > 0.75) {
    const raiseAmount = Math.min(Math.floor(pot * 0.8) + currentBet, stack + currentBet);
    return { action: 'raise', amount: raiseAmount };
  }
  if (toCall > 0) {
    return { action: 'call', amount: currentBet + toCall };
  }
  return { action: 'check', amount: 0 };
};
