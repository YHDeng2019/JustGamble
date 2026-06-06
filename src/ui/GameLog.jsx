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
          {logs.map((log, i) => (
            <div key={i} className={`log-entry text-${log.color}`}>
              <span className="log-time">[{log.time}]</span>
              <span className="log-player">{log.player}:</span>
              <span className="log-message">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default GameLog;
