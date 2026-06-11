import { ref, push, onChildAdded, off, query, limitToLast } from 'firebase/database';
import { getFirebaseDB } from './firebase';

/**
 * 表情服务
 * 支持玩家发送快捷表情到房间
 */

// 预定义表情列表（含音效映射）
export const EMOJIS = [
  { id: 'nice', emoji: '👍', text: 'Nice!', sound: null },
  { id: 'gg', emoji: '🎮', text: 'GG', sound: null },
  { id: 'laugh', emoji: '😂', text: '哈哈哈', sound: 'laugh' },
  { id: 'think', emoji: '🤔', text: '让我想想', sound: null },
  { id: 'allIn', emoji: '🔥', text: 'All In!', sound: 'ohmygod' },
  { id: 'sad', emoji: '😢', text: '太难了', sound: 'ohno' },
  { id: 'shocked', emoji: '😱', text: '震惊', sound: 'saywhat' },
  { id: 'disgusted', emoji: '🤢', text: '呃...', sound: 'ewww' },
];

/**
 * 发送表情到房间
 */
export const sendEmoji = async (roomId, userId, userName, emojiId) => {
  const emoji = EMOJIS.find(e => e.id === emojiId);
  if (!emoji) {
    throw new Error('Invalid emoji ID');
  }

  const db = getFirebaseDB();
  const emojisRef = ref(db, `rooms/${roomId}/emojis`);

  await push(emojisRef, {
    userId,
    userName,
    emojiId: emoji.id,
    emoji: emoji.emoji,
    text: emoji.text,
    timestamp: Date.now()
  });
};

/**
 * 订阅房间表情
 * 返回 unsubscribe 函数
 */
export const subscribeToEmojis = (roomId, callback) => {
  const db = getFirebaseDB();
  // 只获取最近的 20 条表情
  const emojisRef = query(ref(db, `rooms/${roomId}/emojis`), limitToLast(20));

  const listener = onChildAdded(emojisRef, (snapshot) => {
    const emoji = snapshot.val();
    if (emoji && emoji.timestamp) {
      // 只处理最近 30 秒内的表情（避免加载旧消息）
      const age = Date.now() - emoji.timestamp;
      if (age < 30000) {
        callback(emoji);
      }
    }
  });

  return () => off(emojisRef, 'child_added', listener);
};
