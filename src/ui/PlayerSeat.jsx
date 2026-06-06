import React, { useState, useEffect } from 'react';
import Card from './Card';

const PlayerSeat = ({ player, isCurrent, isDealer, position, aiType, isThinking, isWinner, visibleCards, blindLabel }) => {
  const [actionToast, setActionToast] = useState(null);
  const [prevBet, setPrevBet] = useState(player.bet);
  const [prevFolded, setPrevFolded] = useState(player.folded);
  const [prevCurrent, setPrevCurrent] = useState(isCurrent);
  const [flyingChip, setFlyingChip] = useState(0);

  useEffect(() => {
    // 弃牌检测
    if (player.folded && !prevFolded) {
      setActionToast({ text: '🚫 弃牌', type: 'fold' });
      const timer = setTimeout(() => setActionToast(null), 1400);
      setPrevFolded(true);
      return () => clearTimeout(timer);
    }

    // 下注/加注检测
    if (player.bet > prevBet) {
      const diff = player.bet - prevBet;
      const text = `💰 ${diff === player.bet ? '下注' : '加注'} ${diff}`;
      setActionToast({ text, type: 'raise' });
      setFlyingChip(c => c + 1);
      const timer = setTimeout(() => setActionToast(null), 1400);
      setPrevBet(player.bet);
      return () => clearTimeout(timer);
    }

    // Check 检测：轮次切换时 bet 没变
    if (prevCurrent && !isCurrent && player.bet === prevBet && !player.folded) {
      setActionToast({ text: '✋ Check', type: 'check' });
      const timer = setTimeout(() => setActionToast(null), 1400);
      return () => clearTimeout(timer);
    }

    // 新回合重置（bet 归零）
    if (player.bet === 0 && prevBet > 0) {
      setPrevBet(0);
    }

    // 更新状态
    setPrevCurrent(isCurrent);
    setPrevFolded(player.folded);
  }, [player.bet, player.folded, isCurrent]);

  const seatClass = `player-seat seat-${position} ${isCurrent ? 'active' : ''} ${player.folded ? 'folded' : ''} ${player.isHuman ? 'human' : ''} ${isWinner ? 'winner' : ''} ${isThinking ? 'thinking' : ''}`;

  // 根据 visibleCards 决定显示多少张牌
  const cardsToShow = player.hand ? player.hand.slice(0, visibleCards ?? player.hand.length) : [];

  return (
    <div className={seatClass}>
      {isDealer && <div className="dealer-btn">D</div>}
      {blindLabel && <div className={`blind-btn blind-${blindLabel.toLowerCase()}`}>{blindLabel}</div>}

      {actionToast && (
        <div className={`action-toast toast-${actionToast.type}`}>
          {actionToast.text}
        </div>
      )}

      {flyingChip > 0 && (
        <div key={flyingChip} className={`flying-chip fly-${position}`}>
          <div className="chip-token"></div>
        </div>
      )}

      <div className="player-info">
        <div className="player-avatar">{player.avatar}</div>
        <div className="player-name">{player.name}</div>

        {!player.isHuman && aiType && (
          <div className={`ai-type-badge ai-${aiType}`}>
            {aiType === 'llm' ? '🧠' : '💻'}
          </div>
        )}

        <div className="player-chips">{player.chips}</div>
        {player.bet > 0 && <div className="player-bet">下注: {player.bet}</div>}
        {player.allIn && <div className="all-in-badge">ALL IN</div>}

        {isThinking && !player.isHuman && (
          <div className="thinking-indicator">
            <span className="thinking-text">思考中</span>
            <div className="thinking-dot"></div>
            <div className="thinking-dot"></div>
            <div className="thinking-dot"></div>
          </div>
        )}
      </div>

      {cardsToShow.length > 0 && (
        <div className={`player-hand ${player.showHand ? 'showdown-reveal' : ''}`}>
          {cardsToShow.map((card, i) => (
            <div key={i} className="deal-card-wrapper" style={{ animationDelay: `${i * 100}ms` }}>
              <Card
                card={card}
                flipped={!player.isHuman && !player.showHand}
                size="mini"
                className={player.isHuman ? 'player-card-human' : ''}
              />
            </div>
          ))}
        </div>
      )}

      {player.showHand && player.handName && (
        <div className="hand-name-badge">{player.handName}</div>
      )}
    </div>
  );
};

export default PlayerSeat;
