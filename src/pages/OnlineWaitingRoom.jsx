import React, { useState, useEffect } from 'react';
import { subscribeToRoom, leaveRoom, setPlayerReady, addBot, startGame, kickPlayer } from '../services/roomService';
import { startHeartbeat, stopHeartbeat } from '../services/heartbeatService';
import { getPersonalities } from '../ai/personalities';

const OnlineWaitingRoom = ({ roomId, user, onGameStart, onBack }) => {
  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const isHost = room?.hostId === user.userId;
  const players = room?.players ? Object.values(room.players) : [];
  const maxPlayers = room?.settings.maxPlayers || 4;
  const allReady = players.length >= 2 && players.length === maxPlayers && players.every(p => p.isReady);
  const isFull = players.length >= maxPlayers;

  useEffect(() => {
    // 订阅房间状态
    const unsubscribe = subscribeToRoom(roomId, (roomData) => {
      if (!roomData || !roomData.players) {
        setError('房间已关闭');
        // 延迟返回大厅，避免立即卸载导致的错误
        setTimeout(() => onBack(), 1000);
        return;
      }
      setRoom(roomData);

      // 如果游戏已开始，跳转到游戏页面
      if (roomData.status === 'playing') {
        onGameStart(roomId);
      }
    });

    // 启动心跳
    startHeartbeat(roomId, user.userId);

    return () => {
      unsubscribe();
      stopHeartbeat();
    };
  }, [roomId, user.userId, onGameStart, onBack]);

  const handleReady = async () => {
    setLoading(true);
    try {
      const currentPlayer = room.players[user.userId];
      await setPlayerReady(roomId, user.userId, !currentPlayer.isReady);
    } catch (err) {
      console.error('[等待室] 设置准备状态失败:', err);
      setError('操作失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddBot = async () => {
    setLoading(true);
    try {
      const personalities = getPersonalities();
      const usedNames = players.map(p => p.displayName);
      const available = personalities.filter(p => !usedNames.includes(p.name));

      if (available.length === 0) {
        setError('没有更多机器人可添加');
        return;
      }

      const personality = available[Math.floor(Math.random() * available.length)];
      await addBot(roomId, personality);
    } catch (err) {
      console.error('[等待室] 添加机器人失败:', err);
      setError('添加失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartGame = async () => {
    if (!allReady) {
      setError('所有玩家必须准备就绪');
      return;
    }

    setLoading(true);
    try {
      await startGame(roomId);
      // 游戏开始后会通过订阅自动跳转
    } catch (err) {
      console.error('[等待室] 开始游戏失败:', err);
      setError('开始失败: ' + err.message);
      setLoading(false);
    }
  };

  const handleLeaveRoom = async () => {
    if (!confirm('确定要离开房间吗？')) {
      return;
    }

    try {
      await leaveRoom(roomId, user.userId);
      onBack();
    } catch (err) {
      console.error('[等待室] 离开房间失败:', err);
    }
  };

  const handleCopyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(room.roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[等待室] 复制房间码失败:', err);
      setError('复制失败，请手动复制');
    }
  };

  const handleKickPlayer = async (targetUserId, targetName) => {
    if (!confirm(`确定要踢出玩家 ${targetName} 吗？`)) {
      return;
    }

    setLoading(true);
    try {
      await kickPlayer(roomId, user.userId, targetUserId);
    } catch (err) {
      console.error('[等待室] 踢出玩家失败:', err);
      setError('踢出失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!room) {
    return (
      <div className="page-container">
        <div className="loading">加载中...</div>
      </div>
    );
  }

  return (
    <div className="page-container waiting-room">
      <div className="room-header">
        <button className="btn btn-small" onClick={handleLeaveRoom}>
          离开
        </button>
        <div className="room-title">
          <h1>房间: {room.roomCode}</h1>
          <button
            className={`btn btn-small copy-btn ${copied ? 'copied' : ''}`}
            onClick={handleCopyRoomCode}
            title="复制房间码"
          >
            {copied ? '✓ 已复制' : '📋 复制'}
          </button>
          {isHost && <span className="host-badge">👑 房主</span>}
        </div>
      </div>

      {error && (
        <div className="error-toast">
          {error}
          <button onClick={() => setError('')}>✕</button>
        </div>
      )}

      <div className="room-content">
        <div className="room-info card-panel">
          <h3>🎮 游戏设置</h3>
          <div className="settings-grid">
            <div className="setting-item">
              <span className="label">人数:</span>
              <span className="value">{players.length} / {room.settings.maxPlayers}</span>
            </div>
            <div className="setting-item">
              <span className="label">初始筹码:</span>
              <span className="value">{room.settings.initialChips}</span>
            </div>
            <div className="setting-item">
              <span className="label">小盲注:</span>
              <span className="value">{room.settings.smallBlind}</span>
            </div>
            <div className="setting-item">
              <span className="label">大盲注:</span>
              <span className="value">{room.settings.bigBlind}</span>
            </div>
          </div>
        </div>

        <div className="players-section card-panel">
          <h3>👥 玩家列表</h3>
          <div className="players-grid">
            {players.map((player) => (
              <div
                key={player.userId}
                className={`player-card ${player.isReady ? 'ready' : ''} ${!player.isOnline ? 'offline' : ''}`}
              >
                <div className="player-avatar">{player.avatar}</div>
                <div className="player-info">
                  <div className="player-name">
                    {player.displayName}
                    {player.isBot && <span className="bot-badge">🤖</span>}
                    {player.userId === room.hostId && <span className="host-icon">👑</span>}
                  </div>
                  <div className="player-status">
                    {player.isReady ? '✅ 已准备' : '⏳ 未准备'}
                  </div>
                </div>
                {/* 房主可以踢出其他玩家 */}
                {isHost && player.userId !== user.userId && (
                  <button
                    className="btn btn-danger btn-small kick-btn"
                    onClick={() => handleKickPlayer(player.userId, player.displayName)}
                    disabled={loading}
                    title="踢出玩家"
                  >
                    ❌
                  </button>
                )}
              </div>
            ))}

            {/* 空位 */}
            {Array.from({ length: room.settings.maxPlayers - players.length }).map((_, i) => (
              <div key={`empty-${i}`} className="player-card empty">
                <div className="empty-slot">空位</div>
              </div>
            ))}
          </div>
        </div>

        <div className="room-actions">
          {!isHost ? (
            <button
              className="btn btn-primary btn-large"
              onClick={handleReady}
              disabled={loading}
            >
              {room.players[user.userId]?.isReady ? '取消准备' : '准备'}
            </button>
          ) : (
            <>
              {!isFull && (
                <button
                  className="btn btn-large"
                  onClick={handleAddBot}
                  disabled={loading}
                >
                  ➕ 添加机器人
                </button>
              )}
              <button
                className="btn btn-primary btn-large"
                onClick={handleStartGame}
                disabled={loading || !allReady}
              >
                {allReady ? '🎮 开始游戏' : `等待玩家准备 (${players.filter(p => p.isReady).length}/${players.length})`}
              </button>
            </>
          )}
        </div>

        <div className="room-tips card-panel">
          <h4>💡 提示</h4>
          <ul>
            <li>分享房间码 <strong>{room.roomCode}</strong> 邀请好友</li>
            <li>至少需要 2 名玩家才能开始游戏</li>
            <li>房主可以添加 AI 机器人补位</li>
            <li>所有玩家准备后，房主可以开始游戏</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default OnlineWaitingRoom;
