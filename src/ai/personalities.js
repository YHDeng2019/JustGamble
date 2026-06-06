export const AI_PERSONALITIES = [
  {
    id: 'alex',
    name: 'Alex',
    avatar: '🎩',
    style: 'conservative',
    description: '保守型，只玩强牌，很少虚张声势'
  },
  {
    id: 'riley',
    name: 'Riley',
    avatar: '🦊',
    style: 'aggressive',
    description: '激进型，频繁加注，喜欢诈唬'
  },
  {
    id: 'sam',
    name: 'Sam',
    avatar: '🌸',
    style: 'balanced',
    description: '平衡型，按赔率决策，偶尔诈唬'
  },
  {
    id: 'jordan',
    name: 'Jordan',
    avatar: '🎲',
    style: 'random',
    description: '随机型，决策带随机性，难以预测'
  },
  {
    id: 'morgan',
    name: 'Morgan',
    avatar: '🧊',
    style: 'mathematical',
    description: '数学型，严格按胜率和底池赔率行动'
  }
];

export const getAIPlayer = (index) => {
  return AI_PERSONALITIES[index % AI_PERSONALITIES.length];
};

// 随机打乱数组（Fisher-Yates 洗牌算法）
const shuffleArray = (array) => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

// 获取随机打乱后的 AI 玩家列表（用于游戏开始时随机分配性格）
export const getShuffledAIPlayers = (count) => {
  const shuffled = shuffleArray(AI_PERSONALITIES);
  return shuffled.slice(0, count);
};
