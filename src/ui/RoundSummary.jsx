import React, { useState, useEffect } from 'react';
import Card from './Card';

/**
 * 回合结束弹窗
 * @param {Object} props
 * @param {Array} props.players - 玩家列表，包含chips、hand、showHand等信息
 * @param {Object} props.result - 回合结果 { winners: {playerId: amount}, playerHands: {playerId: handName} }
 * @param {number} props.initialChips - 初始筹码，用于计算盈亏
 * @param {Function} props.onReady - 点击"准备"按钮的回调
 * @param {Function} props.onUnready - 点击"取消准备"按钮的回调
 * @param {boolean} props.isReady - 当前玩家是否已准备
 * @param {Object} props.readyStatus - 所有玩家的准备状态 {playerId: boolean}（仅联机模式）
 * @param {boolean} props.isOnlineMode - 是否联机模式
 */
const RoundSummary = ({
  players,
  result,
  initialChips,
  communityCards = [],
  onReady,
  onUnready,
  isReady,
  readyStatus = {},
  isOnlineMode = false,
  onExit
}) => {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!players || !result) return;

    // 联机模式下，只有当前玩家已准备且没有其他人未准备时才倒计时
    // 默认视为已准备，只有明确标记 false（点击取消准备）才算未准备
    if (isOnlineMode) {
      const someoneUnready = players.some(p => {
        const isBot = p.isBot || p.isHuman === false;
        return !isBot && readyStatus[p.id] === false;
      });
      if (someoneUnready) {
        setCountdown(5); // 有人取消准备，重置倒计时
        return;
      }
    }

    // 倒计时逻辑
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [players, result, isOnlineMode, readyStatus]);

  if (!players || !result) return null;

  const winnerIds = Object.keys(result.winners || {});
  const allReady = Object.values(readyStatus).every(status => status === true);
  // 等待列表只显示明确取消准备（false）的真人玩家
  // 默认视为已准备（未在 readyStatus 中或为 true 都算准备好）
  const unreadyPlayers = players.filter(p => {
    const isBot = p.isBot || p.isHuman === false;
    return !isBot && readyStatus[p.id] === false;
  });

  return (
    <div className="round-summary-overlay">
      <div className="round-summary-modal compact">
        <div className="round-summary-header">
          {isOnlineMode && onExit && (
            <button className="summary-exit-btn" onClick={onExit} title="退出游戏">
              退出
            </button>
          )}
          <h2 className="round-summary-title">🎯 回合小结</h2>
          {isOnlineMode && (
            <div className="countdown-badge">
              {unreadyPlayers.length > 0 ? '⏸' : (countdown > 0 ? countdown : '✓')}
            </div>
          )}
        </div>

        {/* 公共牌（只展示已翻出的牌） */}
        {communityCards && communityCards.length > 0 && (
          <div className="summary-community">
            <span className="summary-community-label">公共牌</span>
            <div className="summary-community-cards">
              {communityCards.map((card, i) => (
                <Card key={i} card={card} size="mini" />
              ))}
            </div>
          </div>
        )}

        <div className="summary-table">
          <div className="summary-table-header">
            <div className="col-player">玩家</div>
            <div className="col-chips">筹码</div>
            <div className="col-profit">盈亏</div>
            <div className="col-hand">手牌</div>
          </div>

          {players.map(player => {
            const isWinner = winnerIds.includes(player.id);
            const winAmount = result.winners?.[player.id] || 0;
            // 本回合盈亏 = 当前筹码 - 本手开始时筹码（而非整局初始筹码）
            // 回退到 initialChips 以兼容旧数据
            const baseChips = player.roundStartChips ?? initialChips;
            const profit = player.chips - baseChips;
            // 牌型名称：优先用玩家自带的 handName（摊牌时引擎已设置并随状态同步），
            // 回退到 result.playerHands（可能是对象 {rank,name,...} 或字符串）
            const handData = result.playerHands?.[player.id];
            const resultHandName = typeof handData === 'object' ? (handData?.name || '') : (handData || '');
            const handName = player.handName || resultHandName;
            // 是否展示手牌：摊牌玩家（showHand）或有牌型数据，且手牌存在且非牌背
            const hasRealHand = player.hand && player.hand.length > 0 && !player.hand.some(c => c?.isBack);
            const showCards = player.showHand && hasRealHand;

            return (
              <div
                key={player.id}
                className={`summary-table-row ${isWinner ? 'winner' : ''}`}
              >
                <div className="col-player">
                  <span className="player-avatar-small">{player.avatar}</span>
                  <span className="player-name-small">{player.name}</span>
                  {isWinner && <span className="winner-icon">🏆</span>}
                </div>
                <div className="col-chips">{player.chips}</div>
                <div className={`col-profit ${profit > 0 ? 'profit' : profit < 0 ? 'loss' : ''}`}>
                  {profit > 0 ? '+' : ''}{profit}
                </div>
                <div className="col-hand">
                  {showCards ? (
                    <div className="hand-compact">
                      {player.hand.map((card, i) => (
                        <Card key={i} card={card} size="mini" />
                      ))}
                      {handName && <span className="hand-name-compact">{handName}</span>}
                    </div>
                  ) : (
                    <span className="no-show">-</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* 联机模式显示准备状态和取消准备按钮 */}
        {isOnlineMode && (
          <div className="round-summary-ready-section compact">
            {!isReady ? (
              <button className="btn btn-primary" onClick={onReady}>
                准备好了
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={onUnready}>
                取消准备
              </button>
            )}

            {unreadyPlayers.length > 0 ? (
              <div className="waiting-info">
                等待 {unreadyPlayers.map(p => p.name).join('、')} 准备中...
              </div>
            ) : (
              <div className="all-ready-info">
                ✓ 所有玩家已准备{countdown > 0 ? ` · ${countdown}秒后开始` : ''}
              </div>
            )}
          </div>
        )}

        {/* 单人模式显示自动倒计时 */}
        {!isOnlineMode && (
          <div className="round-summary-auto-close compact">
            <span>{countdown > 0 ? `${countdown}秒后自动开始下一轮...` : '准备开始...'}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default RoundSummary;
