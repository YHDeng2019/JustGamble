import { updateHeartbeat } from './roomService';

let heartbeatInterval = null;

/**
 * 开始心跳检测
 */
export const startHeartbeat = (roomId, userId) => {
  // 清除旧的心跳
  stopHeartbeat();

  // 立即发送一次
  updateHeartbeat(roomId, userId).catch(err => {
    console.error('[心跳] 更新失败:', err);
  });

  // 每5秒发送一次心跳
  heartbeatInterval = setInterval(() => {
    updateHeartbeat(roomId, userId).catch(err => {
      console.error('[心跳] 更新失败:', err);
    });
  }, 5000);

  console.log('[心跳] 已启动');
};

/**
 * 停止心跳检测
 */
export const stopHeartbeat = () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    console.log('[心跳] 已停止');
  }
};

/**
 * 检查玩家是否在线（15秒无心跳视为离线）
 */
export const isPlayerOnline = (player) => {
  if (!player || !player.lastHeartbeat) {
    return false;
  }
  const now = Date.now();
  const timeout = 15000; // 15秒超时
  return (now - player.lastHeartbeat) < timeout;
};
