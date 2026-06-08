import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// 初始化 Firebase
let app = null;
let db = null;

export const initFirebase = () => {
  if (!app) {
    try {
      app = initializeApp(firebaseConfig);
      db = getDatabase(app);
      console.log('[Firebase] 初始化成功');
    } catch (error) {
      console.error('[Firebase] 初始化失败:', error);
      throw error;
    }
  }
  return { app, db };
};

export const getFirebaseDB = () => {
  if (!db) {
    initFirebase();
  }
  return db;
};

export const isFirebaseConfigured = () => {
  return !!(
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_DATABASE_URL &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID
  );
};
