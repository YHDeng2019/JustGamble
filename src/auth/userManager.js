import { v4 as uuidv4 } from 'uuid';
import { getUsers, saveUsers, getCurrentUser, setCurrentUser, clearCurrentUser } from './storage';

const AVATARS = ['🎯', '🎲', '🃏', '🦊', '🎩', '🌸', '🧊', '🎭', '🦁', '🐉', '🌊', '⚡'];

export const createUser = (displayName, avatar, pin = '') => {
  const userId = `user_${uuidv4()}`;
  const users = getUsers();

  users[userId] = {
    userId,
    displayName,
    avatar,
    pin,
    createdAt: new Date().toISOString(),
    settings: {
      apiBaseUrl: import.meta.env.VITE_DEFAULT_API_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
      apiKey: import.meta.env.VITE_DEFAULT_API_KEY || '',
      aiModel: import.meta.env.VITE_DEFAULT_AI_MODEL || 'doubao-seed-2-0-pro-260215',
      defaultPlayers: 4,
      initialChips: 1000,
      bigBlind: 20,
      smallBlind: 10
    },
    stats: {
      totalGames: 0,
      wins: 0,
      losses: 0,
      totalProfit: 0,
      biggestWin: 0,
      bestHand: ''
    },
    history: []
  };

  saveUsers(users);
  return users[userId];
};

export const deleteUser = (userId) => {
  const users = getUsers();
  delete users[userId];
  saveUsers(users);
  if (getCurrentUser() === userId) {
    clearCurrentUser();
  }
};

export const getUserById = (userId) => {
  const users = getUsers();
  return users[userId] || null;
};

export const updateUser = (userId, updates) => {
  const users = getUsers();
  if (users[userId]) {
    users[userId] = { ...users[userId], ...updates };
    saveUsers(users);
    return users[userId];
  }
  return null;
};

export const verifyPin = (userId, pin) => {
  const user = getUserById(userId);
  if (!user) return false;
  if (user.pin === '') return true;
  return user.pin === pin;
};

export const loginUser = (userId) => {
  setCurrentUser(userId);
  return getUserById(userId);
};

export const logoutUser = () => {
  clearCurrentUser();
};

export const addGameHistory = (userId, gameRecord) => {
  const user = getUserById(userId);
  if (!user) return;
  
  user.history.unshift(gameRecord);
  if (user.history.length > 50) {
    user.history.pop();
  }
  
  user.stats.totalGames++;
  if (gameRecord.result === 'win') {
    user.stats.wins++;
  } else if (gameRecord.result === 'lose') {
    user.stats.losses++;
  }
  user.stats.totalProfit += gameRecord.profit;
  if (gameRecord.profit > user.stats.biggestWin) {
    user.stats.biggestWin = gameRecord.profit;
  }
  if (gameRecord.bestHand && (!user.stats.bestHand || getHandRank(gameRecord.bestHand) > getHandRank(user.stats.bestHand))) {
    user.stats.bestHand = gameRecord.bestHand;
  }
  
  updateUser(userId, user);
};

const getHandRank = (hand) => {
  const ranks = {
    '高牌': 0,
    '一对': 1,
    '两对': 2,
    '三条': 3,
    '顺子': 4,
    '同花': 5,
    '葫芦': 6,
    '四条': 7,
    '同花顺': 8,
    '皇家同花顺': 9
  };
  return ranks[hand] || 0;
};

export const getAvatars = () => AVATARS;
