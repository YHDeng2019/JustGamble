import { getCurrentUser, clearCurrentUser as clearSession } from './storage';
import { loginUser, getUserById } from './userManager';

let currentUser = null;

export const getSessionUser = () => {
  if (currentUser) return currentUser;
  const userId = getCurrentUser();
  if (userId) {
    currentUser = getUserById(userId);
  }
  return currentUser;
};

export const setSessionUser = (user) => {
  currentUser = user;
  if (user) {
    loginUser(user.userId);
  } else {
    clearSession();
  }
};

export const refreshSessionUser = () => {
  const userId = getCurrentUser();
  if (userId) {
    currentUser = getUserById(userId);
  }
  return currentUser;
};

export const logoutSession = () => {
  currentUser = null;
  clearSession();
};
