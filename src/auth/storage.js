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

export const getUsers = () => {
  return storage.get(STORAGE_KEYS.USERS) || {};
};

export const saveUsers = (users) => {
  storage.set(STORAGE_KEYS.USERS, users);
};

export const getCurrentUser = () => {
  return storage.get(STORAGE_KEYS.CURRENT_USER);
};

export const setCurrentUser = (userId) => {
  storage.set(STORAGE_KEYS.CURRENT_USER, userId);
};

export const clearCurrentUser = () => {
  storage.remove(STORAGE_KEYS.CURRENT_USER);
};
