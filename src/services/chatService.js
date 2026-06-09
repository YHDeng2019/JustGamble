import { ref, push, onChildAdded, off, query, limitToLast } from 'firebase/database';
import { getFirebaseDB } from './firebase';

/**
 * 聊天服务
 * 支持玩家在房间内发送文字消息
 */

/**
 * 发送聊天消息到房间
 */
export const sendChatMessage = async (roomId, userId, userName, message) => {
  if (!message || message.trim().length === 0) {
    throw new Error('消息不能为空');
  }

  if (message.length > 200) {
    throw new Error('消息过长（最多200字）');
  }

  const db = getFirebaseDB();
  const chatRef = ref(db, `rooms/${roomId}/chat`);

  await push(chatRef, {
    userId,
    userName,
    message: message.trim(),
    timestamp: Date.now()
  });
};

/**
 * 订阅房间聊天消息
 * 返回 unsubscribe 函数
 */
export const subscribeToChatMessages = (roomId, callback) => {
  const db = getFirebaseDB();
  // 只获取最近的 50 条消息
  const chatRef = query(ref(db, `rooms/${roomId}/chat`), limitToLast(50));

  const listener = onChildAdded(chatRef, (snapshot) => {
    const message = snapshot.val();
    if (message && message.timestamp) {
      // 只处理最近 60 秒内的消息（避免加载旧消息）
      const age = Date.now() - message.timestamp;
      if (age < 60000) {
        callback(message);
      }
    }
  });

  return () => off(chatRef, 'child_added', listener);
};
