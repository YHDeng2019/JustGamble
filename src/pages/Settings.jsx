import React, { useState, useEffect } from 'react';
import { refreshSessionUser, setSessionUser, logoutSession } from '../auth/session';
import { updateUser, deleteUser, getAvatars, verifyPin } from '../auth/userManager';
import { isSoundEnabled, setSoundEnabled, playSound, setMusicMuted } from '../game/sound';

const Settings = ({ onBack, onLogout }) => {
  const [user, setUser] = useState(null);
  const [displayName, setDisplayName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [apiBaseUrl, setApiBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [aiModel, setAiModel] = useState('');
  const [defaultPlayers, setDefaultPlayers] = useState(4);
  const [initialChips, setInitialChips] = useState(1000);
  const [bigBlind, setBigBlind] = useState(20);
  const [smallBlind, setSmallBlind] = useState(10);
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [showPinSection, setShowPinSection] = useState(false);
  const [testingApi, setTestingApi] = useState(false);
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const avatars = getAvatars();

  useEffect(() => {
    const currentUser = refreshSessionUser();
    if (currentUser) {
      setUser(currentUser);
      setDisplayName(currentUser.displayName);
      setAvatar(currentUser.avatar);
      setApiBaseUrl(currentUser.settings.apiBaseUrl);
      setApiKey(currentUser.settings.apiKey);
      setAiModel(currentUser.settings.aiModel);
      setDefaultPlayers(currentUser.settings.defaultPlayers);
      setInitialChips(currentUser.settings.initialChips);
      setBigBlind(currentUser.settings.bigBlind);
      setSmallBlind(currentUser.settings.smallBlind);
    }
  }, []);

  const handleSave = () => {
    if (!user) return;

    const updatedUser = updateUser(user.userId, {
      displayName,
      avatar,
      settings: {
        apiBaseUrl,
        apiKey,
        aiModel,
        defaultPlayers,
        initialChips,
        bigBlind,
        smallBlind
      }
    });

    if (updatedUser) {
      setSessionUser(updatedUser);
      setUser(updatedUser);
      alert('设置已保存！');
    }
  };

  const handleChangePin = () => {
    if (user.pin && !verifyPin(user.userId, oldPin)) {
      alert('旧 PIN 错误！');
      return;
    }

    if (newPin && newPin.length !== 4) {
      alert('新 PIN 必须是4位数字！');
      return;
    }

    const updatedUser = updateUser(user.userId, { pin: newPin });
    if (updatedUser) {
      setSessionUser(updatedUser);
      setUser(updatedUser);
      setOldPin('');
      setNewPin('');
      setShowPinSection(false);
      alert('PIN 已更新！');
    }
  };

  const handleDeleteAccount = () => {
    if (!confirm('确定要删除这个账号吗？所有数据将永久丢失！')) {
      return;
    }

    deleteUser(user.userId);
    logoutSession();
    onLogout();
  };

  const handleTestConnection = async () => {
    setTestingApi(true);
    try {
      console.log('[测试连接] URL:', `${apiBaseUrl}/chat/completions`);
      console.log('[测试连接] Model:', aiModel);
      console.log('[测试连接] API Key前缀:', apiKey.substring(0, 10) + '...');

      const response = await fetch(`${apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: aiModel,
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 5
        })
      });

      console.log('[测试连接] 响应状态:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log('[测试连接] 成功响应:', data);
        alert('✅ 连接成功！');
      } else {
        const errorText = await response.text();
        console.error('[测试连接] 失败响应:', errorText);
        alert(`❌ 连接失败 (${response.status})\n\n${errorText.substring(0, 200)}\n\n请查看Console获取完整错误信息`);
      }
    } catch (error) {
      console.error('[测试连接] 异常:', error);
      alert(`❌ 连接失败\n\n错误: ${error.message}\n\n可能原因:\n1. 网络问题\n2. URL格式错误\n3. CORS跨域限制`);
    } finally {
      setTestingApi(false);
    }
  };

  if (!user) return null;

  return (
    <div className="page-container">
      <div className="settings-header">
        <button className="btn btn-small" onClick={onBack}>返回</button>
        <h1>设置</h1>
      </div>

      <div className="settings-content">
        <div className="settings-section card-panel">
          <h3>个人信息</h3>
          
          <div className="form-group">
            <label>用户名</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength="12"
            />
          </div>

          <div className="form-group">
            <label>头像</label>
            <div className="avatar-select">
              {avatars.map(a => (
                <div
                  key={a}
                  className={`avatar-option ${avatar === a ? 'selected' : ''}`}
                  onClick={() => setAvatar(a)}
                >
                  {a}
                </div>
              ))}
            </div>
          </div>

          <button className="btn" onClick={() => setShowPinSection(!showPinSection)}>
            {showPinSection ? '取消' : '修改 PIN'}
          </button>

          {showPinSection && (
            <div className="pin-section">
              {user.pin && (
                <div className="form-group">
                  <label>旧 PIN</label>
                  <input
                    type="password"
                    value={oldPin}
                    onChange={(e) => setOldPin(e.target.value)}
                    maxLength="4"
                  />
                </div>
              )}
              <div className="form-group">
                <label>新 PIN (留空则清除)</label>
                <input
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  maxLength="4"
                />
              </div>
              <button className="btn btn-primary" onClick={handleChangePin}>
                确认修改
              </button>
            </div>
          )}
        </div>

        <div className="settings-section card-panel">
          <h3>AI API 配置</h3>
          
          <div className="form-group">
            <label>API Base URL</label>
            <input
              type="text"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div className="form-group">
            <label>API Key</label>
            <div className="password-input">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="输入 API Key"
              />
              <button
                className="btn btn-small"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>模型名称</label>
            <input
              type="text"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              placeholder="gpt-4o-mini"
            />
          </div>

          <button className="btn" onClick={handleTestConnection} disabled={testingApi}>
            {testingApi ? '测试中...' : '测试连接'}
          </button>
        </div>

        <div className="settings-section card-panel">
          <h3>游戏设置</h3>
          
          <div className="form-group">
            <label>默认游戏人数</label>
            <select value={defaultPlayers} onChange={(e) => setDefaultPlayers(parseInt(e.target.value))}>
              <option value={4}>4人</option>
              <option value={5}>5人</option>
              <option value={6}>6人</option>
            </select>
          </div>

          <div className="form-group">
            <label>初始筹码</label>
            <input
              type="number"
              value={initialChips}
              onChange={(e) => setInitialChips(parseInt(e.target.value))}
              min="100"
            />
          </div>

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

          <div className="form-group">
            <label>音效</label>
            <button
              className={`btn sound-toggle ${soundOn ? 'sound-on' : ''}`}
              onClick={() => {
                const next = !soundOn;
                setSoundEnabled(next);
                setSoundOn(next);
                // 关闭音效时同步静音 BGM，开启时恢复
                setMusicMuted(!next);
                if (next) playSound('chip');
              }}
            >
              {soundOn ? '🔊 已开启' : '🔇 已关闭'}
            </button>
          </div>
        </div>

        <div className="settings-actions">
          <button className="btn btn-primary btn-large" onClick={handleSave}>
            保存设置
          </button>
          
          <button className="btn btn-danger" onClick={handleDeleteAccount}>
            删除账号
          </button>
          
          <button className="btn" onClick={onLogout}>
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
