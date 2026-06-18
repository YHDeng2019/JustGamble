import React, { useState, useEffect } from 'react';
import { getUsers } from '../auth/storage';
import { createUser, deleteUser, loginUser, getAvatars } from '../auth/userManager';
import { setSessionUser } from '../auth/session';
import Avatar from '../ui/Avatar';

const SelectUser = ({ onSelectUser }) => {
  const [users, setUsers] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [step, setStep] = useState(1);
  const [newUserName, setNewUserName] = useState('');
  const [newUserAvatar, setNewUserAvatar] = useState(null);
  const avatars = getAvatars();

  useEffect(() => {
    setUsers(getUsers());
    setNewUserAvatar(avatars[0]);
  }, []);

  const selectUser = (user) => {
    const loggedIn = loginUser(user.userId);
    setSessionUser(loggedIn);
    onSelectUser(loggedIn);
  };

  const handleCreateUser = () => {
    if (!newUserName || newUserName.length < 2 || newUserName.length > 12) {
      alert('用户名需在 2-12 字符之间');
      return;
    }
    if (step === 1) {
      setStep(2);
    } else {
      const user = createUser(newUserName, newUserAvatar || avatars[0], '');
      setUsers(getUsers());
      setShowCreate(false);
      setStep(1);
      selectUser(user);
    }
  };

  const handleDeleteUser = (e, userId) => {
    e.stopPropagation();
    if (confirm('确定要删除这个用户吗？')) {
      deleteUser(userId);
      setUsers(getUsers());
    }
  };

  if (Object.keys(users).length === 0 && !showCreate) {
    setShowCreate(true);
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Texas Hold'em - JustGamble</h1>

      {!showCreate && (
        <div className="user-select">
          <h2>选择用户</h2>
          <div className="user-list">
            {Object.values(users).map(user => (
              <div key={user.userId} className="user-card" onClick={() => selectUser(user)}>
                <div className="user-avatar-large">
                  <Avatar avatar={user.avatar} size="lg" />
                </div>
                <div className="user-display-name">{user.displayName}</div>
                <div className="user-stats">
                  <span>场次: {user.stats.totalGames}</span>
                  <span>胜率: {user.stats.totalGames > 0 ? Math.round(user.stats.wins / user.stats.totalGames * 100) : 0}%</span>
                </div>
                <button className="btn btn-danger btn-small" onClick={(e) => handleDeleteUser(e, user.userId)}>
                  删除
                </button>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + 新建用户
          </button>
        </div>
      )}

      {showCreate && (
        <div className="create-user">
          <div className="card-panel">
            <h2>创建新用户</h2>

            {step === 1 && (
              <div className="create-step">
                <label>用户名</label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="输入用户名 (2-12字符)"
                  maxLength="12"
                />
                <button className="btn btn-primary" onClick={handleCreateUser}>下一步</button>
              </div>
            )}

            {step === 2 && (
              <div className="create-step">
                <label>选择头像</label>
                <div className="avatar-select">
                  {avatars.map(avatar => (
                    <div
                      key={avatar}
                      className={`avatar-option${newUserAvatar === avatar ? ' selected' : ''}`}
                      onClick={() => setNewUserAvatar(avatar)}
                    >
                      <Avatar avatar={avatar} size="md" />
                    </div>
                  ))}
                </div>
                <div className="btn-group">
                  <button className="btn" onClick={() => setStep(1)}>上一步</button>
                  <button className="btn btn-primary" onClick={handleCreateUser}>完成</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SelectUser;
