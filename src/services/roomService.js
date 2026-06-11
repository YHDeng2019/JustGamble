import { ref, set, get, update, remove, push, onValue, off, onDisconnect } from 'firebase/database';
import { getFirebaseDB } from './firebase';
import { generateRoomCode, generateRoomId } from '../utils/roomCodeGenerator';

/**
 * 创建房间
 */
export const createRoom = async (hostUser, settings) => {
  const db = getFirebaseDB();
  const roomId = generateRoomId();
  const roomCode = generateRoomCode();

  const roomData = {
    roomId,
    roomCode,
    hostId: hostUser.userId,
    isPublic: settings.isPublic || false,
    status: 'waiting', // waiting | playing | finished
    settings: {
      maxPlayers: settings.maxPlayers || 4,
      initialChips: settings.initialChips || 1000,
      smallBlind: settings.smallBlind || 10,
      bigBlind: settings.bigBlind || 20
    },
    players: {
      [hostUser.userId]: {
        userId: hostUser.userId,
        displayName: hostUser.displayName,
        avatar: hostUser.avatar,
        chips: settings.initialChips || 1000,
        isReady: true, // 房主默认准备
        isOnline: true,
        isBot: false,
        lastHeartbeat: Date.now()
      }
    },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  await set(ref(db, `rooms/${roomId}`), roomData);

  // 添加到公开房间列表（如果是公开房间）
  if (settings.isPublic) {
    await set(ref(db, `lobby/publicRooms/${roomId}`), {
      roomCode,
      hostName: hostUser.displayName,
      playerCount: 1,
      maxPlayers: settings.maxPlayers || 4,
      status: 'waiting'
    });
  }

  return { roomId, roomCode };
};

/**
 * 通过房间码查找房间
 */
export const findRoomByCode = async (roomCode) => {
  const db = getFirebaseDB();
  const roomsRef = ref(db, 'rooms');
  const snapshot = await get(roomsRef);

  if (!snapshot.exists()) {
    return null;
  }

  const rooms = snapshot.val();
  for (const [roomId, room] of Object.entries(rooms)) {
    if (room.roomCode === roomCode) {
      return { ...room, roomId };
    }
  }

  return null;
};

/**
 * 加入房间
 */
export const joinRoom = async (roomCode, user) => {
  const room = await findRoomByCode(roomCode);

  if (!room) {
    throw new Error('房间不存在');
  }

  if (room.status !== 'waiting') {
    throw new Error('游戏已开始，无法加入');
  }

  const playerCount = Object.keys(room.players || {}).length;
  if (playerCount >= room.settings.maxPlayers) {
    throw new Error('房间已满');
  }

  // 检查是否已经在房间中
  if (room.players[user.userId]) {
    return room.roomId; // 已在房间中，直接返回
  }

  const db = getFirebaseDB();

  // 添加玩家到房间
  await set(ref(db, `rooms/${room.roomId}/players/${user.userId}`), {
    userId: user.userId,
    displayName: user.displayName,
    avatar: user.avatar,
    chips: room.settings.initialChips,
    isReady: false,
    isOnline: true,
    isBot: false,
    lastHeartbeat: Date.now()
  });

  // 更新房间更新时间
  await update(ref(db, `rooms/${room.roomId}`), {
    updatedAt: Date.now()
  });

  // 更新公开房间列表
  if (room.isPublic) {
    await update(ref(db, `lobby/publicRooms/${room.roomId}`), {
      playerCount: playerCount + 1
    });
  }

  return room.roomId;
};

/**
 * 离开房间
 */
export const leaveRoom = async (roomId, userId) => {
  const db = getFirebaseDB();
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) {
    return;
  }

  const room = snapshot.val();

  // 移除玩家
  await remove(ref(db, `rooms/${roomId}/players/${userId}`));

  const remainingPlayers = Object.keys(room.players || {}).filter(id => id !== userId);

  // 如果房间空了，删除房间
  if (remainingPlayers.length === 0) {
    await remove(roomRef);
    if (room.isPublic) {
      await remove(ref(db, `lobby/publicRooms/${roomId}`));
    }
    return;
  }

  // 如果房主离开，转让房主
  if (room.hostId === userId) {
    const newHostId = remainingPlayers[0];
    await update(roomRef, {
      hostId: newHostId,
      updatedAt: Date.now()
    });
  }

  // 更新公开房间列表
  if (room.isPublic) {
    await update(ref(db, `lobby/publicRooms/${roomId}`), {
      playerCount: remainingPlayers.length
    });
  }
};

/**
 * 设置玩家准备状态
 */
export const setPlayerReady = async (roomId, userId, isReady) => {
  const db = getFirebaseDB();
  await update(ref(db, `rooms/${roomId}/players/${userId}`), {
    isReady
  });
};

/**
 * 添加AI机器人
 */
export const addBot = async (roomId, personality) => {
  const db = getFirebaseDB();
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) {
    throw new Error('房间不存在');
  }

  const room = snapshot.val();
  const playerCount = Object.keys(room.players || {}).length;

  if (playerCount >= room.settings.maxPlayers) {
    throw new Error('房间已满');
  }

  const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

  await set(ref(db, `rooms/${roomId}/players/${botId}`), {
    userId: botId,
    displayName: personality.name,
    avatar: personality.avatar,
    chips: room.settings.initialChips,
    isReady: true,
    isOnline: true,
    isBot: true,
    style: personality.style
  });

  // 更新公开房间列表
  if (room.isPublic) {
    await update(ref(db, `lobby/publicRooms/${roomId}`), {
      playerCount: playerCount + 1
    });
  }
};

/**
 * 踢出玩家（仅房主可用）
 */
export const kickPlayer = async (roomId, hostId, targetUserId) => {
  const db = getFirebaseDB();
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) {
    throw new Error('房间不存在');
  }

  const room = snapshot.val();

  // 验证是否为房主
  if (room.hostId !== hostId) {
    throw new Error('只有房主可以踢人');
  }

  // 不能踢自己
  if (targetUserId === hostId) {
    throw new Error('不能踢出自己');
  }

  // 游戏开始后不能踢人
  if (room.status !== 'waiting') {
    throw new Error('游戏已开始，无法踢人');
  }

  // 移除玩家
  await remove(ref(db, `rooms/${roomId}/players/${targetUserId}`));

  const remainingPlayers = Object.keys(room.players || {}).filter(id => id !== targetUserId);

  // 更新公开房间列表
  if (room.isPublic) {
    await update(ref(db, `lobby/publicRooms/${roomId}`), {
      playerCount: remainingPlayers.length
    });
  }

  await update(roomRef, {
    updatedAt: Date.now()
  });
};

/**
 * 开始游戏
 */
export const startGame = async (roomId) => {
  const db = getFirebaseDB();
  await update(ref(db, `rooms/${roomId}`), {
    status: 'playing',
    startedAt: Date.now(),
    updatedAt: Date.now()
  });

  // 更新公开房间列表
  const roomSnapshot = await get(ref(db, `rooms/${roomId}`));
  if (roomSnapshot.exists() && roomSnapshot.val().isPublic) {
    await update(ref(db, `lobby/publicRooms/${roomId}`), {
      status: 'playing'
    });
  }
};

/**
 * 获取房间信息
 */
export const getRoom = async (roomId) => {
  const db = getFirebaseDB();
  const snapshot = await get(ref(db, `rooms/${roomId}`));

  if (!snapshot.exists()) {
    return null;
  }

  return { ...snapshot.val(), roomId };
};

/**
 * 监听房间变化
 */
export const subscribeToRoom = (roomId, callback) => {
  const db = getFirebaseDB();
  const roomRef = ref(db, `rooms/${roomId}`);

  onValue(roomRef, (snapshot) => {
    if (snapshot.exists()) {
      callback({ ...snapshot.val(), roomId });
    } else {
      callback(null);
    }
  });

  // 返回取消订阅函数
  return () => off(roomRef);
};

/**
 * 获取公开房间列表
 */
export const getPublicRooms = async () => {
  const db = getFirebaseDB();
  const snapshot = await get(ref(db, 'lobby/publicRooms'));

  if (!snapshot.exists()) {
    return [];
  }

  const rooms = snapshot.val();
  return Object.entries(rooms).map(([roomId, room]) => ({
    ...room,
    roomId
  })).filter(room => room.status === 'waiting');
};

/**
 * 监听公开房间列表
 */
export const subscribeToPublicRooms = (callback) => {
  const db = getFirebaseDB();
  const lobbyRef = ref(db, 'lobby/publicRooms');

  onValue(lobbyRef, (snapshot) => {
    if (snapshot.exists()) {
      const rooms = snapshot.val();
      const roomList = Object.entries(rooms).map(([roomId, room]) => ({
        ...room,
        roomId
      })).filter(room => room.status === 'waiting');
      callback(roomList);
    } else {
      callback([]);
    }
  });

  return () => off(lobbyRef);
};

/**
 * 更新心跳
 */
export const updateHeartbeat = async (roomId, userId) => {
  const db = getFirebaseDB();
  await update(ref(db, `rooms/${roomId}/players/${userId}`), {
    lastHeartbeat: Date.now(),
    isOnline: true
  });
};

/**
 * 注册断线自动清理：当客户端断开连接（关闭浏览器、断网、崩溃）时，
 * Firebase 服务器会自动将该玩家从房间移除。
 * 这是解决"玩家直接关浏览器后仍留在房间"问题的关键。
 */
export const setupDisconnectCleanup = async (roomId, userId) => {
  const db = getFirebaseDB();
  const playerRef = ref(db, `rooms/${roomId}/players/${userId}`);
  try {
    // 断线时移除该玩家节点（服务器端执行，不依赖客户端）
    await onDisconnect(playerRef).remove();
    console.log('[房间] 已注册断线自动清理:', userId);
  } catch (err) {
    console.error('[房间] 注册断线清理失败:', err);
  }
};

/**
 * 取消断线清理（正常离开房间或进入游戏时调用，避免误删）
 */
export const cancelDisconnectCleanup = async (roomId, userId) => {
  const db = getFirebaseDB();
  const playerRef = ref(db, `rooms/${roomId}/players/${userId}`);
  try {
    await onDisconnect(playerRef).cancel();
    console.log('[房间] 已取消断线清理:', userId);
  } catch (err) {
    console.error('[房间] 取消断线清理失败:', err);
  }
};

/**
 * 修复孤儿房间：当房主因断线被移除（hostId 指向已不存在的玩家）时，
 * 转让房主给第一个剩余玩家；若房间已空则删除。
 * 由客户端在订阅回调中检测并调用（幂等，多人同时调用安全）。
 */
export const reconcileRoomHost = async (roomId) => {
  const db = getFirebaseDB();
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) return;

  const room = snapshot.val();
  const playerIds = Object.keys(room.players || {});

  // 房间已空，删除
  if (playerIds.length === 0) {
    await remove(roomRef);
    if (room.isPublic) {
      await remove(ref(db, `lobby/publicRooms/${roomId}`));
    }
    return;
  }

  // 房主仍在，无需处理
  if (room.hostId && room.players[room.hostId]) return;

  // 房主已不在，转让给第一个真人玩家（优先），否则第一个玩家
  const humanIds = playerIds.filter(id => !room.players[id].isBot);
  const newHostId = humanIds[0] || playerIds[0];
  await update(roomRef, {
    hostId: newHostId,
    updatedAt: Date.now()
  });
  if (room.isPublic) {
    await update(ref(db, `lobby/publicRooms/${roomId}`), {
      playerCount: playerIds.length
    });
  }
  console.log('[房间] 房主已转让给:', newHostId);
};
