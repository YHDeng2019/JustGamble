import React from 'react';

const GameLog = ({ logs, collapsed, onToggle }) => {
  return (
    <div className={`game-log ${collapsed ? 'collapsed' : ''}`}>
      <div className="log-header" onClick={onToggle}>
        <span className="log-title">游戏日志</span>
        <span className="log-toggle">{collapsed ? '▶' : '▼'}</span>
      </div>
      
      {!collapsed && (
        <div className="log-content">
          {logs.map((log, i) => {
            // 最新的两条日志高亮（日志数组是按时间顺序，最新的在最后）
            const isRecent = i >= logs.length - 2;
            return (
              <div key={i} className={`log-entry text-${log.color} ${isRecent ? 'log-recent' : ''}`}>
                <span className="log-time">[{log.time}]</span>
                <span className="log-player">{log.player}:</span>
                <span className="log-message">{log.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GameLog;
