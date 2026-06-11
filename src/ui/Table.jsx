import React, { useState, useEffect, useRef } from 'react';
import Card from './Card';
import PlayerSeat from './PlayerSeat';
import { playSound } from '../game/sound';

// 座位布局配置 - 根据人数不同
const getSeatPositions = (totalPlayers) => {
  const layouts = {
    2: ['bottom', 'top'],
    3: ['bottom', 'left', 'right'],
    4: ['bottom', 'left', 'top', 'right'],
    5: ['bottom', 'left', 'top-left', 'top-right', 'right'],
    6: ['bottom', 'left', 'top-left', 'top', 'top-right', 'right']
  };
  return layouts[totalPlayers] || layouts[6];
};

const STAGE_NAMES = {
  FLOP: '翻牌',
  TURN: '转牌',
  RIVER: '河牌'
};

const Table = ({ gameState, aiStatus, userSettings, thinkingAi, totalPlayers, winnerHighlight, dealingCards, stealthMode, chatBubbles = {} }) => {
  const { players, communityCards, pot, currentPlayerIndex, dealerIndex, stage } = gameState;
  const [stageAnnounce, setStageAnnounce] = useState(null);
  const [potBounce, setPotBounce] = useState(false);
  const [visibleCommunity, setVisibleCommunity] = useState(communityCards.length); // 实际展示的公共牌数（逐张揭示）
  const prevPotRef = useRef(pot);
  const prevStageRef = useRef(stage);
  const prevCardsCountRef = useRef(communityCards.length);
  const revealTimersRef = useRef([]);

  // 阶段切换公告
  useEffect(() => {
    if (stage !== prevStageRef.current && STAGE_NAMES[stage]) {
      setStageAnnounce(STAGE_NAMES[stage]);
      const timer = setTimeout(() => setStageAnnounce(null), 1200);
      prevStageRef.current = stage;
      return () => clearTimeout(timer);
    }
    prevStageRef.current = stage;
  }, [stage]);

  // 底池金额变化动画
  useEffect(() => {
    if (pot !== prevPotRef.current && pot > 0) {
      setPotBounce(true);
      const timer = setTimeout(() => setPotBounce(false), 400);
      prevPotRef.current = pot;
      return () => clearTimeout(timer);
    }
    prevPotRef.current = pot;
  }, [pot]);

  // 公共牌逐张揭示：每张间隔 350ms 翻出，配翻牌音效
  useEffect(() => {
    const target = communityCards.length;
    const prev = prevCardsCountRef.current;

    // 清理上一批未完成的计时器
    revealTimersRef.current.forEach(clearTimeout);
    revealTimersRef.current = [];

    if (target > prev) {
      // 新增了牌：从 prev 开始逐张揭示
      for (let n = prev + 1; n <= target; n++) {
        const idx = n;
        const t = setTimeout(() => {
          setVisibleCommunity(idx);
          playSound('flip', stealthMode);
        }, (n - prev - 1) * 350);
        revealTimersRef.current.push(t);
      }
    } else {
      // 重置（新一局）或无变化：直接同步
      setVisibleCommunity(target);
    }

    prevCardsCountRef.current = target;
    return () => {
      revealTimersRef.current.forEach(clearTimeout);
      revealTimersRef.current = [];
    };
  }, [communityCards.length]);

  const positions = getSeatPositions(totalPlayers);

  // 检查是否有任何AI玩家实际成功使用了LLM（而不仅仅是配置了）
  const hasActiveLLM = Object.values(aiStatus).some(status => status === 'llm');
  const apiConnected = userSettings?.apiKey && userSettings?.apiBaseUrl && hasActiveLLM;

  // 重排玩家，让当前用户始终在底部
  // 联机模式：使用 userId 精确匹配
  // 单机模式：userSettings?.userId 不存在时回退到 isHuman
  const humanIndex = userSettings?.userId
    ? players.findIndex(p => p.id === userSettings.userId)
    : players.findIndex(p => p.isHuman);

  const reorderedPlayers = humanIndex >= 0
    ? [...players.slice(humanIndex), ...players.slice(0, humanIndex)]
    : players;

  console.log('[Table] 当前用户ID:', userSettings?.userId, '找到的玩家索引:', humanIndex, '总玩家数:', players.length);

  // 计算小盲/大盲座位索引（基于原始索引）
  const sbIndex = (dealerIndex + 1) % players.length;
  const bbIndex = (dealerIndex + 2) % players.length;

  return (
    <div className="game-table">
      {/* API状态标记移到外层，避免被table-felt裁切 */}
      <div className="api-status">
        {apiConnected ? (
          <span className="api-connected">
            <span className="status-dot"></span> LLM
          </span>
        ) : (
          <span className="api-disconnected">
            <span className="status-dot"></span> 本地 AI
          </span>
        )}
      </div>

      <div className={`table-felt players-${totalPlayers}`}>
        <div className={`pot-display ${potBounce ? 'pot-bounce' : ''}`}>
          <div className="pot-label">底池</div>
          <div className="pot-amount">{pot}</div>
        </div>

        {stageAnnounce && (
          <div className="stage-announce">
            {stageAnnounce}
          </div>
        )}

        <div className="community-cards">
          {communityCards.slice(0, visibleCommunity).map((card, i) => (
            <div
              key={`${card.id}-${i}`}
              className="community-card-wrapper card-reveal"
            >
              <Card card={card} flipped={false} size="small" />
            </div>
          ))}
        </div>
      </div>

      {reorderedPlayers.map((player, displayIndex) => {
        // 找到该玩家在原始数组中的索引
        const originalIndex = players.findIndex(p => p.id === player.id);

        // 计算该玩家已发到的牌数（发牌顺序：从 dealer+1 开始轮流，每人两张）
        const dealOrder = (originalIndex - (dealerIndex + 1) + players.length) % players.length;
        const card1Index = dealOrder; // 第一轮
        const card2Index = players.length + dealOrder; // 第二轮
        const visibleCards = dealingCards !== undefined
          ? (dealingCards > card2Index ? 2 : dealingCards > card1Index ? 1 : 0)
          : player.hand?.length || 0;

        return (
          <PlayerSeat
            key={player.id}
            player={player}
            isCurrent={originalIndex === currentPlayerIndex}
            isDealer={originalIndex === dealerIndex}
            position={positions[displayIndex % positions.length]}
            aiType={aiStatus[player.id]}
            isThinking={thinkingAi === player.id}
            isWinner={winnerHighlight && winnerHighlight.includes(player.id)}
            visibleCards={visibleCards}
            blindLabel={originalIndex === sbIndex ? 'SB' : originalIndex === bbIndex ? 'BB' : null}
            chatBubble={chatBubbles[player.id]?.text}
          />
        );
      })}
    </div>
  );
};

export default Table;
