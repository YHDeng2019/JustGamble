import React, { useState, useEffect } from 'react';
import { isFirebaseConfigured } from '../services/firebase';
import { createRoom, joinRoom, getPublicRooms, subscribeToPublicRooms } from '../services/roomService';

const OnlineLobby = ({ user, onRoomJoined, onBack }) => {
  const [mode, setMode] = useState('menu'); // menu | create | join | browse
  const [roomCode, setRoomCode] = useState('');
  const [publicRooms, setPublicRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 房间设置
  const [isPublic, setIsPublic] = useState(false);
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [initialChips, setInitialChips] = useState(1000);
  const [smallBlind, setSmallBlind] = useState(10);
  const [bigBlind, setBigBlind] = useState(20);

  useEffect(() => {
    // 进入联机大厅时才初始化 Firebase
    if (!isFirebaseConfigured()) {
      setError('未配置 Firebase，请查看 ONLINE_MODE.md 配置指南');
      return;
    }

    // 尝试初始化 Firebase
    try {
      import('../services/firebase').then(({ initFirebase }) => {
        initFirebase();
        console.log('[联机大厅] Firebase 初始化成功');
      });
    } catch (err) {
      console.error('[联机大厅] Firebase 初始化失败:', err);
      setError('Firebase 初始化失败: ' + err.message);
      return;
    }

    // 如果在浏览模式，订阅公开房间列表
    if (mode === 'browse') {
      const unsubscribe = subscribeToPublicRooms((rooms) => {
        setPublicRooms(rooms);
      });
      return unsubscribe;
    }
  }, [mode]);

  const handleCreateRoom = async () => {
    setLoading(true);
    setError('');

    try {
      const settings = {
        isPublic,
        maxPlayers,
        initialChips,
        smallBlind,
        bigBlind
      };

      const { roomId, roomCode: code } = await createRoom(user, settings);
      console.log('[大厅] 房间创建成功:', code);
      onRoomJoined(roomId);
    } catch (err) {
      console.error('[大厅] 创建房间失败:', err);
      setError('创建房间失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (code = null) => {
    const targetCode = code || roomCode.toUpperCase().trim();
    if (!targetCode) {
      setError('请输入房间码');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const roomId = await joinRoom(targetCode, user);
      console.log('[大厅] 加入房间成功:', roomId);
      onRoomJoined(roomId);
    } catch (err) {
      console.error('[大厅] 加入房间失败:', err);
      setError('加入失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isFirebaseConfigured()) {
    return (
      <div className="page-container">
        <div className="error-message">
          <h2>⚠️ Firebase 未配置</h2>
          <p>联机模式需要配置 Firebase</p>
          <button className="btn" onClick={onBack}>返回</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container online-lobby">
      <div className="lobby-header">
        <button className="btn btn-small" onClick={onBack}>返回</button>
        <h1>🌐 联机大厅</h1>
      </div>

      {error && (
        <div className="error-toast">
          {error}
          <button onClick={() => setError('')}>✕</button>
        </div>
      )}

      {mode === 'menu' && (
        <div className="lobby-menu">
          <div className="menu-card">
            <h2>🎮 快速开始</h2>
            <button
              className="btn btn-primary btn-large"
              onClick={() => setMode('create')}
            >
              创建房间
            </button>
            <button
              className="btn btn-large"
              onClick={() => setMode('join')}
            >
              加入房间
            </button>
            <button
              className="btn btn-large"
              onClick={() => setMode('browse')}
            >
              浏览公开房间
            </button>
          </div>

          <div className="lobby-info card-panel">
            <h3>💡 联机模式说明</h3>
            <ul>
              <li>✅ 支持 2-6 人真人对战</li>
              <li>✅ 可添加 AI 机器人补位</li>
              <li>✅ 房间码私密邀请好友</li>
              <li>✅ 公开房间随机匹配</li>
              <li>⏱️ 超时 30 秒自动弃牌</li>
            </ul>
          </div>
        </div>
      )}

      {mode === 'create' && (
        <div className="create-room-form card-panel">
          <h2>创建房间</h2>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
              />
              公开房间（出现在大厅列表）
            </label>
          </div>

          <div className="form-group">
            <label>游戏人数</label>
            <select value={maxPlayers} onChange={(e) => setMaxPlayers(parseInt(e.target.value))}>
              <option value={2}>2 人</option>
              <option value={3}>3 人</option>
              <option value={4}>4 人</option>
              <option value={5}>5 人</option>
              <option value={6}>6 人</option>
            </select>
          </div>

          <div className="form-group">
            <label>初始筹码</label>
            <input
              type="number"
              value={initialChips}
              onChange={(e) => setInitialChips(parseInt(e.target.value))}
              min="100"
              step="100"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>小盲注</label>
              <input
                type="number"
                value={smallBlind}
                onChange={(e) => setSmallBlind(parseInt(e.target.value))}
                min="1"
              />
            </div>
            <div className="form-group">
              <label>大盲注</label>
              <input
                type="number"
                value={bigBlind}
                onChange={(e) => setBigBlind(parseInt(e.target.value))}
                min="2"
              />
            </div>
          </div>

          <div className="form-actions">
            <button
              className="btn btn-primary btn-large"
              onClick={handleCreateRoom}
              disabled={loading}
            >
              {loading ? '创建中...' : '创建房间'}
            </button>
            <button
              className="btn"
              onClick={() => setMode('menu')}
              disabled={loading}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {mode === 'join' && (
        <div className="join-room-form card-panel">
          <h2>加入房间</h2>
          <p>输入 6 位房间码</p>

          <div className="room-code-input">
            <input
              type="text"
              placeholder="ABC123"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              maxLength="6"
              autoFocus
            />
          </div>

          <div className="form-actions">
            <button
              className="btn btn-primary btn-large"
              onClick={() => handleJoinRoom()}
              disabled={loading || roomCode.length !== 6}
            >
              {loading ? '加入中...' : '加入'}
            </button>
            <button
              className="btn"
              onClick={() => setMode('menu')}
              disabled={loading}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {mode === 'browse' && (
        <div className="browse-rooms">
          <div className="browse-header">
            <h2>公开房间</h2>
            <button className="btn btn-small" onClick={() => setMode('menu')}>
              返回
            </button>
          </div>

          {publicRooms.length === 0 ? (
            <div className="empty-state card-panel">
              <p>😴 暂无公开房间</p>
              <button className="btn" onClick={() => setMode('create')}>
                创建房间
              </button>
            </div>
          ) : (
            <div className="rooms-list">
              {publicRooms.map((room) => (
                <div key={room.roomId} className="room-item card-panel">
                  <div className="room-info">
                    <div className="room-code">{room.roomCode}</div>
                    <div className="room-host">房主: {room.hostName}</div>
                    <div className="room-players">
                      {room.playerCount} / {room.maxPlayers} 人
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={() => handleJoinRoom(room.roomCode)}
                    disabled={loading}
                  >
                    加入
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default OnlineLobby;
