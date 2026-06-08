const STORAGE_KEYS = {
  USERS: 'poker_users',
  CURRENT_USER: 'poker_current_user'
};

export const storage = {
  get(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Storage get error:', e);
      return null;
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('Storage set error:', e);
    }
  },

  remove(key) {
    localStorage.removeItem(key);
  }
};

// sessionStorage 用于当前用户会话（按标签页隔离）
export const sessionStore = {
  get(key) {
    try {
      const data = sessionStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('SessionStorage get error:', e);
      return null;
    }
  },

  set(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error('SessionStorage set error:', e);
    }
  },

  remove(key) {
    sessionStorage.removeItem(key);
  }
};

export const getUsers = () => {
  return storage.get(STORAGE_KEYS.USERS) || {};
};

export const saveUsers = (users) => {
  storage.set(STORAGE_KEYS.USERS, users);
};

// 当前用户使用 sessionStorage，每个标签页独立
export const getCurrentUser = () => {
  return sessionStore.get(STORAGE_KEYS.CURRENT_USER);
};

export const setCurrentUser = (userId) => {
  sessionStore.set(STORAGE_KEYS.CURRENT_USER, userId);
};

export const clearCurrentUser = () => {
  sessionStore.remove(STORAGE_KEYS.CURRENT_USER);
};
