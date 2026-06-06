import React, { useState, useEffect } from 'react';
import { refreshSessionUser } from '../auth/session';

// 花色 -> 颜色类（与游戏内四色一致）
const suitColorClass = (suit) => {
  if (suit === '♥') return 'sc-heart';
  if (suit === '♦') return 'sc-diamond';
  if (suit === '♠') return 'sc-spade';
  if (suit === '♣') return 'sc-club';
  return '';
};

// 解析牌 id（如 "10♥"）为 { value, suit }
const parseCard = (id) => {
  const suit = id.slice(-1);
  const value = id.slice(0, -1);
  return { value, suit };
};

// 历史详情里的迷你牌
const MiniCard = ({ id }) => {
  const { value, suit } = parseCard(id);
  return (
    <span className={`hist-card ${suitColorClass(suit)}`}>
      <span className="hist-card-value">{value}</span>
      <span className="hist-card-suit">{suit}</span>
    </span>
  );
};

const History = ({ onBack }) => {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('history');
  const [expandedGame, setExpandedGame] = useState(null);

  useEffect(() => {
    setUser(refreshSessionUser());
  }, []);

  if (!user) return null;

// PLACEHOLDER_REST
  const renderChart = () => {
    const recentGames = user.history.slice(0, 20).reverse();
    const maxProfit = Math.max(...recentGames.map(g => Math.abs(g.profit)), 100);

    return (
      <div className="chart-container">
        <svg width="400" height="200">
          {recentGames.map((game, i) => {
            const x = i * 20 + 10;
            const height = Math.abs(game.profit) / maxProfit * 150;
            const y = game.profit >= 0 ? 175 - height : 175;
            const color = game.profit >= 0 ? '#39ff88' : '#ff4d6d';

            return (
              <rect key={i} x={x} y={y} width={15} height={height} fill={color} />
            );
          })}
          <line x1="0" y1="175" x2="400" y2="175" stroke="#7a8fa6" strokeWidth="1" />
        </svg>
      </div>
    );
  };

  return (
    <div className="page-container">
      <div className="history-header">
        <button className="btn btn-small" onClick={onBack}>返回</button>
        <h1>历史对局</h1>
      </div>

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          对局记录
        </button>
        <button
          className={`tab ${activeTab === 'stats' ? 'active' : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          统计
        </button>
      </div>

      {activeTab === 'history' && (
        <div className="history-list card-panel">
          {user.history.length === 0 ? (
            <div className="empty-state">
              <p>还没有对局记录，去开始第一局吧！</p>
            </div>
          ) : (
            user.history.map(game => {
              const hasShowdowns = game.showdowns && game.showdowns.length > 0;
              const expanded = expandedGame === game.id;
              return (
                <div key={game.id} className="history-item-wrap">
                  <div
                    className={`history-item ${hasShowdowns ? 'clickable' : ''}`}
                    onClick={() => hasShowdowns && setExpandedGame(expanded ? null : game.id)}
                  >
                    <div className="history-date">
                      {new Date(game.playedAt).toLocaleString()}
                    </div>
                    <div className={`history-result ${game.result}`}>
                      {game.result === 'win' ? '获胜' : game.result === 'lose' ? '失败' : '平局'}
                    </div>
                    <div className={`history-profit ${game.profit >= 0 ? 'positive' : 'negative'}`}>
                      {game.profit >= 0 ? '+' : ''}{game.profit}
                    </div>
                    <div className="history-details">
                      <span>{game.playersCount}人局</span>
                      <span>{game.bestHand}</span>
                      <span>{game.durationSeconds}秒</span>
                      {hasShowdowns && (
                        <span className="history-showdown-toggle">
                          摊牌 {game.showdowns.length} 次 {expanded ? '▼' : '▶'}
                        </span>
                      )}
                    </div>
                  </div>

                  {expanded && hasShowdowns && (
                    <div className="showdown-detail">
                      {game.showdowns.map((sd, idx) => (
                        <div key={idx} className="showdown-round">
                          <div className="showdown-round-head">
                            <span className="sd-round-num">第 {sd.round} 局</span>
                            <span className="sd-community">
                              公共牌：
                              {sd.community.map((cid, ci) => (
                                <MiniCard key={ci} id={cid} />
                              ))}
                            </span>
                          </div>
                          <div className="showdown-players">
                            {sd.players.map(p => (
                              <div key={p.id} className={`sd-player ${p.isWinner ? 'sd-winner' : ''}`}>
                                <span className="sd-avatar">{p.avatar}</span>
                                <span className="sd-name">{p.name}</span>
                                <span className="sd-hand">
                                  {p.hand.map((cid, hi) => (
                                    <MiniCard key={hi} id={cid} />
                                  ))}
                                </span>
                                <span className="sd-handname">{p.handName}</span>
                                {p.isWinner && <span className="sd-crown">👑</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="stats-content card-panel">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">总场次</div>
              <div className="stat-value text-gold">{user.stats.totalGames}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">胜率</div>
              <div className="stat-value text-green">
                {user.stats.totalGames > 0 ? Math.round(user.stats.wins / user.stats.totalGames * 100) : 0}%
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">总盈亏</div>
              <div className={`stat-value ${user.stats.totalProfit >= 0 ? 'text-green' : 'text-red'}`}>
                {user.stats.totalProfit >= 0 ? '+' : ''}{user.stats.totalProfit}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-label">最大单局盈利</div>
              <div className="stat-value text-gold">{user.stats.biggestWin}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">历史最佳手牌</div>
              <div className="stat-value text-purple">{user.stats.bestHand || '-'}</div>
            </div>
          </div>

          <div className="chart-section">
            <h3>最近20局盈亏</h3>
            {renderChart()}
          </div>
        </div>
      )}
    </div>
  );
};

export default History;
