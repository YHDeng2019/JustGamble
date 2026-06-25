import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { NiuNiuOnlineEngine } from '../game/niuNiuOnlineEngine';
import { subscribeToRoom, leaveRoom } from '../services/roomService';
import { getFirebaseDB } from '../services/firebase';
import { ref, remove } from 'firebase/database';import { HAND_NAMES, MULTIPLIERS, HAND_RANK, BASE_BET, BANKER_ANTE, isSpecialHand } from '../game/niuNiuEngine';
import { playSound } from '../game/sound';
import { EMOJIS, sendEmoji, subscribeToEmojis } from '../services/emojiService';
import { sendChatMessage, subscribeToChatMessages } from '../services/chatService';
import Avatar from '../ui/Avatar';
import Card from '../ui/Card';
import GameLog from '../ui/GameLog';

const HAND_ICONS = {
  [HAND_RANK.WU_HUA_NIU]:  '/icons/niu/wu_hua_niu.svg',
  [HAND_RANK.BOMB]:         '/icons/niu/bomb.svg',
  [HAND_RANK.WU_XIAO_NIU]: '/icons/niu/wu_xiao_niu.svg',
  [HAND_RANK.NIU_NIU]:      '/icons/niu/lao_niu.svg',
  [HAND_RANK.NO_NIU]:       '/icons/niu/no_niu.svg',
};

// 彩屑随机参数（模块级常量，避免渲染时调用 Math.random）
const CONFETTI_PIECES = [...Array(24)].map(() => ({
  left: Math.random() * 100,
  delay: Math.random() * 0.8,
  duration: 1.5 + Math.random() * 1.5,
}));

// 单张牌 — 使用共享 Card 组件
const NiuCard = ({ card, revealed, delay = 0 }) => (
  <div className="niu2-card-wrapper" style={{ animationDelay: `${delay}ms` }}>
    <Card card={card} flipped={!revealed} size="mini" />
  </div>
);

const NiuSeat = ({ player, hand, revealedCount, seatIdx, result, chg, bet, isBanker, isMe, isWinner, isReady, chatBubble }) => {
  const revealed = revealedCount > seatIdx;
  const handIcon = result ? HAND_ICONS[result.rank] : null;
  const cls = ['niu2-seat', isBanker && 'banker', isMe && 'human',
    isWinner ? 'winner' : (chg > 0 ? 'win-glow' : chg < 0 ? 'lose-glow' : '')].filter(Boolean).join(' ');
  return (
    <div className={cls} data-seat-idx={seatIdx}>
      {chatBubble && (
        <div className="chat-bubble">
          <div className="chat-bubble-text">{chatBubble}</div>
          <div className="chat-bubble-arrow" />
        </div>
      )}
      <div className="niu2-seat-top">
        <Avatar avatar={player.avatar} size="md" />
        <div className="niu2-seat-info">
          <div className="niu2-name">
            {player.name}{isMe ? ' (你)' : ''}
            {isReady !== undefined && (
              <span className={`niu2-ready-dot${isReady ? ' ready' : ''}`} title={isReady ? '已就绪' : '未就绪'} />
            )}
          </div>
          <div className="niu2-chips">{player.chips} 筹</div>
        </div>
        {isBanker && <span className="niu2-banker-tag">庄</span>}
        {bet > 0 && !isBanker && <span className="niu2-bet-tag">注 {bet}</span>}
      </div>
      <div className="niu2-hand">
        {hand && hand.length > 0 ? hand.map((card, ci) => (
          <NiuCard
            key={card.id}
            card={isMe || revealed ? card : null}
            revealed={isMe || revealed}
            delay={ci * 55}
          />
        )) : Array.from({ length: 5 }).map((_, ci) => (
          <NiuCard key={ci} card={null} revealed={false} delay={ci * 55} />
        ))}
      </div>
      {revealed && result && (
        <div className={`niu2-hand-name niu-rank-${result.rank}`}>
          {handIcon && <img src={handIcon} className="niu2-hand-icon" alt="" />}
          <span>{result.name}</span>
          {MULTIPLIERS[result.rank] > 1 && <span className="niu2-multiplier">×{MULTIPLIERS[result.rank]}</span>}
        </div>
      )}
      {chg !== null && chg !== undefined && chg !== 0 && (
        <div className={`niu2-change${chg > 0 ? ' win' : ' lose'}`}>{chg > 0 ? '+' : ''}{chg}</div>
      )}
    </div>
  );
};

const NiuNiuOnlineGame = ({ roomId, user, onExit, stealthMode, onToggleStealth, soundEnabled, onToggleSound }) => {
  const [gameState, setGameState] = useState(null);
  const [room, setRoom]           = useState(null);
  const [humanBet, setHumanBet]   = useState(BASE_BET);
  const [humanBetInput, setHumanBetInput] = useState(String(BASE_BET));
  const [error, setError]         = useState('');
  const [specialFlash, setSpecialFlash] = useState(null);
  const [flyingChip, setFlyingChip] = useState(null);   // 结算飞行动画
  const [gameLog, setGameLog]     = useState([]);
  const [logCollapsed, setLogCollapsed] = useState(true);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState([]);
  const [showChatBox, setShowChatBox] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBubbles, setChatBubbles] = useState({});
  const engineRef = useRef(null);
  const prevPhaseRef = useRef('');
  const settleTimerRef = useRef(null);
  const buttonRef = useRef(null);
  const settingsRef = useRef(null);
  const lastLogRoundRef = useRef(0);

  const isHost = room?.hostId === user.userId;

  useEffect(() => {
    // 订阅房间数据
    const unsub = subscribeToRoom(roomId, (roomData) => {
      setRoom(roomData);
    });
    return unsub;
  }, [roomId]);

  useEffect(() => {
    if (!room) return;
    // 初始化引擎
    const isHostNow = room.hostId === user.userId;
    if (!engineRef.current) {
      const engine = new NiuNiuOnlineEngine(roomId, user.userId, isHostNow);
      engineRef.current = engine;
      engine.subscribeState((state) => {
        setGameState(state);
      });
      if (isHostNow) {
        engine.subscribeActions();
        // 若游戏尚未开始，初始化
        if (!gameState) {
          engine.initGame(room);
        }
      }
    }
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, [room?.hostId]);

  // 音效触发 & 结算动画
  useEffect(() => {
    if (!gameState) return;
    const phase = gameState.phase;
    const prev  = prevPhaseRef.current;
    if (phase !== prev) {
      if (phase === 'reveal') playSound('niu_deal', !soundEnabled);
      if (phase === 'settle' || phase === 'banker_opt' || phase === 'auto_change_banker') {
        // 播放结算飞行动画
        const steps = gameState.settlements;
        if (steps && steps.length > 0) {
          let i = 0;
          const playNext = () => {
            if (i >= steps.length) {
              setFlyingChip(null);
              // 音效
              const myIdx = gameState.players?.findIndex(p => p.id === user.userId);
              const chg = gameState.changes?.[myIdx];
              if (chg > 0) playSound('niu_win', !soundEnabled);
              else if (chg < 0) playSound('niu_lose', !soundEnabled);
              const hasSpecial = gameState.handResults?.some(r => isSpecialHand(r.rank));
              if (hasSpecial) {
                const top = gameState.handResults.filter(r => isSpecialHand(r.rank)).sort((a, b) => b.rank - a.rank)[0];
                setSpecialFlash({ name: top.name, icon: HAND_ICONS[top.rank] || '' });
                playSound('niu_special', !soundEnabled);
                setTimeout(() => setSpecialFlash(null), 2000);
              }
              return;
            }
            const step = steps[i];
            // 计算玩家头像与底池的位置，实现从头像飞出/飞进动画
            const seatEl = document.querySelector(`[data-seat-idx="${step.idx}"]`);
            const potEl = document.querySelector('.niu2-pot') || document.querySelector('.niu2-felt');
            const tableEl = document.querySelector('.niu2-table-area');
            let fromX = '50%', fromY = '50%', toX = '50%', toY = '50%';
            if (seatEl && potEl && tableEl) {
              const seatRect = seatEl.getBoundingClientRect();
              const potRect = potEl.getBoundingClientRect();
              const tableRect = tableEl.getBoundingClientRect();
              const seatCx = seatRect.left + seatRect.width / 2 - tableRect.left;
              const seatCy = seatRect.top + seatRect.height / 2 - tableRect.top;
              const potCx = potRect.left + potRect.width / 2 - tableRect.left;
              const potCy = potRect.top + potRect.height / 2 - tableRect.top;
              if (step.action === 'lose') {
                fromX = `${seatCx}px`; fromY = `${seatCy}px`;
                toX = `${potCx}px`; toY = `${potCy}px`;
              } else {
                fromX = `${potCx}px`; fromY = `${potCy}px`;
                toX = `${seatCx}px`; toY = `${seatCy}px`;
              }
            }
            setFlyingChip({ ...step, fromX, fromY, toX, toY, stepIdx: i, total: steps.length });
            playSound('niu_bet', !soundEnabled);
            settleTimerRef.current = setTimeout(() => {
              setFlyingChip(null);
              i++;
              settleTimerRef.current = setTimeout(playNext, 150);
            }, 700);
          };
          playNext();
        } else {
          const myIdx = gameState.players?.findIndex(p => p.id === user.userId);
          const chg = gameState.changes?.[myIdx];
          if (chg > 0) playSound('niu_win', !soundEnabled);
          else if (chg < 0) playSound('niu_lose', !soundEnabled);
        }
      }
      if (phase !== 'settle' && phase !== 'banker_opt' && phase !== 'auto_change_banker') {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFlyingChip(null);
      }
      prevPhaseRef.current = phase;
    }
    return () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    };
  }, [gameState?.phase]);

  // 订阅房间表情
  useEffect(() => {
    if (!roomId) return;
    const unsub = subscribeToEmojis(roomId, (emoji) => {
      const newEmoji = { id: Date.now() + Math.random(), ...emoji };
      setFloatingEmojis(prev => [...prev, newEmoji]);
      const emojiConfig = EMOJIS.find(e => e.id === emoji.emojiId);
      if (emojiConfig?.sound) {
        playSound(emojiConfig.sound, !soundEnabled);
      }
      setTimeout(() => {
        setFloatingEmojis(prev => prev.filter(e => e.id !== newEmoji.id));
      }, 3000);
    });
    return unsub;
  }, [roomId, soundEnabled]);

  // 订阅房间聊天
  useEffect(() => {
    if (!roomId) return;
    const unsub = subscribeToChatMessages(roomId, (message) => {
      setChatMessages(prev => [...prev.slice(-49), message]);
      const bubbleId = `${message.userId}_${message.timestamp}`;
      setChatBubbles(prev => ({
        ...prev,
        [message.userId]: { text: message.message, id: bubbleId }
      }));
      setTimeout(() => {
        setChatBubbles(prev => {
          if (prev[message.userId]?.id === bubbleId) {
            const next = { ...prev };
            delete next[message.userId];
            return next;
          }
          return prev;
        });
      }, 3000);
    });
    return unsub;
  }, [roomId]);

  // 计算设置下拉菜单位置
  useEffect(() => {
    if (showSettingsMenu && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      });
    }
  }, [showSettingsMenu]);

  // 点击外部区域关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target) &&
          buttonRef.current && !buttonRef.current.contains(event.target)) {
        setShowSettingsMenu(false);
      }
    };
    if (showSettingsMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettingsMenu]);

  // 根据游戏状态生成日志
  useEffect(() => {
    if (!gameState) return;
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const addLog = (player, message, color = 'default') => {
      setGameLog(prev => [...prev.slice(-49), { time, player, message, color }]);
    };

    // 结算阶段：记录每位玩家的结算结果（每局只记一次）
    if (gameState.phase === 'settle' && gameState.changes && gameState.handResults) {
      const curRound = gameState.round || 0;
      if (curRound !== lastLogRoundRef.current) {
        lastLogRoundRef.current = curRound;
        gameState.players.forEach((p, i) => {
          const chg = gameState.changes[i] || 0;
          const result = gameState.handResults[i];
          const sign = chg >= 0 ? '+' : '';
          addLog(p.name, `${result?.name || '—'} ${sign}${chg}`, chg > 0 ? 'green' : chg < 0 ? 'red' : 'default');
        });
      }
    }
    // 转庄
    if (gameState.phase === 'idle' && gameState.bankerIndex !== undefined) {
      const banker = gameState.players?.[gameState.bankerIndex];
      if (banker && gameState.round !== undefined && gameState.round !== lastLogRoundRef.current) {
        lastLogRoundRef.current = gameState.round;
        addLog('系统', `${banker.name} 当庄`, 'green');
      }
    }
  }, [gameState?.phase, gameState?.round]);

  const handleSendEmoji = async (emojiId) => {
    try {
      await sendEmoji(roomId, user.userId, user.displayName, emojiId);
      setShowEmojiPicker(false);
    } catch (err) {
      console.error('[斗牛联机] 发送表情失败:', err);
    }
  };

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    try {
      await sendChatMessage(roomId, user.userId, user.displayName, chatInput);
      setChatInput('');
    } catch (err) {
      console.error('[斗牛联机] 发送消息失败:', err);
    }
  };

  const handleExit = async () => {
    await leaveRoom(roomId, user.userId);
    // 清理斗牛状态
    try {
      const db = getFirebaseDB();
      if (isHost) await remove(ref(db, `rooms/${roomId}/niuState`));
    } catch {}
    onExit();
  };

  const handleConfirmBet = () => {
    const maxChips = myPlayer?.chips || 0;
    const amount = Math.max(1, Math.min(parseInt(humanBetInput) || humanBet || BASE_BET, maxChips));
    setHumanBet(amount);
    setHumanBetInput(String(amount));
    engineRef.current?.pushAction({ type: 'bet', amount });
  };

  const handleBankerDeal = () => {
    engineRef.current?.pushAction({ type: 'banker_deal' });
  };

  const handleNextRound = () => {
    engineRef.current?.pushAction({ type: 'next_round' });
  };

  const handleBankerOpt = (keep) => {
    engineRef.current?.pushAction({ type: 'banker_opt', keep });
  };

  if (!gameState) {
    return (
      <div className={`niu2-page${stealthMode ? ' stealth-mode' : ''}`}>
        <div className="niu2-header">
          <button className="btn btn-icon" onClick={handleExit}>←</button>
          <div className="niu2-title">🐂 斗牛联机</div>
          <div />
        </div>
        <div className="niu2-table-area" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: '#aaa' }}>连接中…</div>
        </div>
      </div>
    );
  }

  const players      = gameState.players || [];
  const bankerIndex  = gameState.bankerIndex || 0;
  const bankerPlayer = players[bankerIndex];
  const idlePlayers  = players.filter((_, i) => i !== bankerIndex);
  const myIdx        = players.findIndex(p => p.id === user.userId);
  const myPlayer     = players[myIdx];
  const amBanker     = myIdx === bankerIndex;
  const phase        = gameState.phase;
  const hands        = gameState.hands || [];
  const results      = gameState.handResults || [];
  const bets         = gameState.bets || [];
  const changes      = gameState.changes;
  const revealedCount = gameState.revealedCount || 0;

  // 计算获胜者
  const winnerIds = changes
    ? players.filter((p, i) => changes[i] > 0).map(p => p.id)
    : [];

  // 阶段标签
  const PHASE_LABELS = {
    idle: '下注阶段',
    reveal: '翻牌阶段',
    settle: '结算阶段',
    banker_opt: '庄家选择',
    gameover: '游戏结束',
  };

  // 是否已提交下注
  const myBet = bets[myIdx] || 0;
  const hasSubmittedBet = phase === 'reveal' || phase === 'settle' || phase === 'banker_opt' || myBet > 0;

  // 判断玩家是否已下注（就绪状态）
  const isPlayerReady = (idx) => {
    if (idx === bankerIndex) return phase !== 'idle';
    return bets[idx] > 0 || phase !== 'idle';
  };

  return (
    <div className={`niu2-page${stealthMode ? ' stealth-mode' : ''}`}>
      {specialFlash && (
        <div className="niu-special-flash">
          {specialFlash.icon && <img src={specialFlash.icon} className="niu-special-flash-icon" alt="" />}
          <div className="niu-special-flash-name">{specialFlash.name}！</div>
        </div>
      )}

      {/* 结算覆盖层（飞行动画结束后显示） */}
      {phase === 'settle' && changes && !flyingChip && (
        <>
          {changes[myIdx] > 0 && (
            <div className="niu2-confetti">
              {CONFETTI_PIECES.map((p, i) => (
                <div
                  key={i}
                  className={`niu2-confetti-piece niu2-confetti-${i % 4}`}
                  style={{
                    left: `${p.left}%`,
                    animationDelay: `${p.delay}s`,
                    animationDuration: `${p.duration}s`,
                  }}
                />
              ))}
            </div>
          )}
          <div className="niu2-result-overlay">
            <div className="niu2-result-card">
              <div className="niu2-result-badge">
                {changes[myIdx] > 0 ? '🏆' : '💸'}
              </div>
              <h2 className={`niu2-result-title ${changes[myIdx] > 0 ? 'win' : 'lose'}`}>
                {changes[myIdx] > 0 ? '你赢了！' : '本局失利'}
              </h2>
              <p className="niu2-result-subtitle">
                {winnerIds.length > 0
                  ? `${players.filter(p => winnerIds.includes(p.id)).map(p => p.name).join('、')} 获胜`
                  : '本局结算'}
              </p>
              <div className={`niu2-result-amount ${changes[myIdx] > 0 ? 'win' : 'lose'}`}>
                {changes[myIdx] > 0 ? '+' : ''}{changes[myIdx]}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="niu2-header">
        <button className="btn btn-icon" onClick={handleExit}>←</button>
        <div className="niu2-title">
          <img src="/icons/niu/niu_niu_logo.svg" className="niu-title-logo" alt="斗牛" />
          斗牛联机
        </div>
        <div className="niu2-header-right">
          <div className="niu2-round">
            第 {gameState.round || 1} 局
            {gameState.pool > 0 && <span className="niu2-pool-badge">底池 {gameState.pool}</span>}
          </div>
          <button
            className="btn btn-icon emoji-btn"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            title="发送表情"
          >
            😊
          </button>
          <button
            className="btn btn-icon chat-btn"
            onClick={() => setShowChatBox(!showChatBox)}
            title="聊天"
          >
            💬
          </button>
          <div className="settings-dropdown">
            <button
              ref={buttonRef}
              className="btn btn-icon settings-toggle-btn"
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              title="快捷设置"
            >
              ⚙️
            </button>
          </div>
        </div>
      </div>

      {/* 表情选择器 */}
      {showEmojiPicker && (
        <div className="emoji-picker">
          {EMOJIS.map(emoji => (
            <button
              key={emoji.id}
              className="emoji-option"
              onClick={() => handleSendEmoji(emoji.id)}
              title={emoji.text}
            >
              <span className="emoji-icon">{emoji.emoji}</span>
              <span className="emoji-label">{emoji.text}</span>
            </button>
          ))}
        </div>
      )}

      {/* 飘浮表情动画 */}
      {floatingEmojis.map(emoji => (
        <div
          key={emoji.id}
          className="floating-emoji"
          style={{
            left: `${20 + Math.random() * 60}%`,
            animationDuration: `${2 + Math.random()}s`
          }}
        >
          <div className="floating-emoji-content">
            <span className="floating-emoji-icon">{emoji.emoji}</span>
            <span className="floating-emoji-text">{emoji.userName}: {emoji.text}</span>
          </div>
        </div>
      ))}

      {/* 快捷设置菜单 */}
      {showSettingsMenu && ReactDOM.createPortal(
        <div
          ref={settingsRef}
          className="settings-menu"
          style={{
            position: 'fixed',
            top: `${menuPosition.top}px`,
            right: `${menuPosition.right}px`,
            zIndex: 9999
          }}
        >
          <div className="settings-menu-item" onClick={onToggleStealth}>
            <span className="settings-menu-icon">{stealthMode ? '🐟' : '👔'}</span>
            <span className="settings-menu-label">摸鱼模式</span>
            <span className={`settings-menu-toggle ${stealthMode ? 'active' : ''}`}>
              {stealthMode ? 'ON' : 'OFF'}
            </span>
          </div>
          <div className="settings-menu-item" onClick={onToggleSound}>
            <span className="settings-menu-icon">{soundEnabled ? '🔊' : '🔇'}</span>
            <span className="settings-menu-label">音效</span>
            <span className={`settings-menu-toggle ${soundEnabled ? 'active' : ''}`}>
              {soundEnabled ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>,
        document.body
      )}

      {/* 阶段指示器 */}
      {phase !== 'gameover' && (
        <div className={`niu2-phase-banner ${phase}`}>
          {PHASE_LABELS[phase] || ''}
        </div>
      )}

      <div className="niu2-table-area">
        <div className="niu2-banker-row">
          <NiuSeat
            player={bankerPlayer}
            hand={hands[bankerIndex]}
            revealedCount={revealedCount}
            seatIdx={bankerIndex}
            result={results[bankerIndex]}
            chg={changes ? changes[bankerIndex] : null}
            bet={0}
            isBanker={true}
            isMe={bankerIndex === myIdx}
            isWinner={winnerIds.includes(bankerPlayer?.id)}
            isReady={isPlayerReady(bankerIndex)}
            chatBubble={chatBubbles[bankerPlayer?.id]?.text}
          />
        </div>

        <div className="niu2-felt">
          {gameState.pool > 0 ? (
            <div className="niu2-pot" key={gameState.pool}>
              <div className="niu2-pot-chips">
                <span className="niu2-pot-chip niu2-pot-chip-3" />
                <span className="niu2-pot-chip niu2-pot-chip-2" />
                <span className="niu2-pot-chip niu2-pot-chip-1" />
              </div>
              <div className="niu2-pot-text">
                <span className="niu2-pot-label">底池</span>
                <span className="niu2-pot-amount">{gameState.pool}</span>
              </div>
            </div>
          ) : (
            <div className="niu2-felt-pool">
              {gameState.tableMsg || (phase === 'idle' ? '等待发牌' : '')}
            </div>
          )}
          {gameState.bankerRounds > 0 && (
            <div className="niu2-felt-rounds">庄家已连庄 {gameState.bankerRounds} 局</div>
          )}

          {/* 结算飞行动画 */}
          {flyingChip && (
            <div
              className={`niu2-fly-chip niu2-fly-${flyingChip.action}`}
              style={{
                '--from-x': flyingChip.fromX,
                '--from-y': flyingChip.fromY,
                '--to-x': flyingChip.toX,
                '--to-y': flyingChip.toY,
              }}
            >
              <div className="niu2-fly-chip-body">
                <span className="niu2-fly-chip-name">{players[flyingChip.idx]?.name}</span>
                <span className="niu2-fly-chip-amount">
                  {flyingChip.action === 'lose' ? '−' : '+'}{flyingChip.amount}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="niu2-players-row">
          {idlePlayers.map((player) => {
            const origIdx = players.findIndex(p => p.id === player.id);
            return (
              <NiuSeat
                key={player.id}
                player={player}
                hand={hands[origIdx]}
                revealedCount={revealedCount}
                seatIdx={origIdx}
                result={results[origIdx]}
                chg={changes ? changes[origIdx] : null}
                bet={bets[origIdx] || 0}
                isBanker={false}
                isMe={origIdx === myIdx}
                isWinner={winnerIds.includes(player.id)}
                isReady={isPlayerReady(origIdx)}
                chatBubble={chatBubbles[player.id]?.text}
              />
            );
          })}
        </div>
      </div>

      <div className="niu2-controls">
        {phase === 'idle' && (
          amBanker ? (
            <div className="niu2-banker-controls">
              <div className="niu2-info-row">你是庄家，本局放入 <strong>{BANKER_ANTE}</strong> 筹码</div>
              <button className="btn btn-primary btn-large" onClick={handleBankerDeal}>🐂 发牌</button>
            </div>
          ) : (
            !hasSubmittedBet ? (
              <div className="niu-bet-controls">
                <div className="niu-bet-title">你的下注（最多 {myPlayer?.chips || 0}）</div>
                <div className="niu2-bet-slider-row">
                  <input
                    type="range"
                    className="niu2-bet-slider"
                    value={humanBet}
                    min={1}
                    max={myPlayer?.chips || 0}
                    onChange={e => {
                      const v = parseInt(e.target.value);
                      setHumanBet(v);
                      setHumanBetInput(String(v));
                    }}
                  />
                  <div className="niu2-bet-input-row">
                    <input
                      type="number"
                      className="niu2-bet-input"
                      value={humanBetInput}
                      min={1}
                      max={myPlayer?.chips || 0}
                      onChange={e => setHumanBetInput(e.target.value)}
                      onBlur={() => {
                        const maxChips = myPlayer?.chips || 0;
                        const v = Math.max(1, Math.min(parseInt(humanBetInput) || BASE_BET, maxChips));
                        setHumanBet(v);
                        setHumanBetInput(String(v));
                      }}
                    />
                    <div className="niu2-bet-presets">
                      {[100, 200, 500].filter(v => v <= (myPlayer?.chips || 0)).map(v => (
                        <button key={v} className={`niu-bet-btn${humanBet === v ? ' selected' : ''}`}
                          onClick={() => { setHumanBet(v); setHumanBetInput(String(v)); }}>{v}</button>
                      ))}
                    </div>
                  </div>
                  <div className="niu2-bet-hint">
                    牛七~牛九 <strong>×2</strong> · 牛牛 <strong>×3</strong> · 特殊牌型 <strong>×5</strong>
                  </div>
                </div>
                <button className="btn btn-primary btn-large" onClick={handleConfirmBet}>确认下注 {humanBet}</button>
              </div>
            ) : (
              <div className="niu-dealing-hint">等待其他玩家下注…</div>
            )
          )
        )}

        {phase === 'reveal' && <div className="niu-dealing-hint">翻牌中…</div>}

        {phase === 'settle' && (
          <div className="niu2-settle-controls">
            {gameState.tableMsg && <div className="niu2-settle-summary">{gameState.tableMsg}</div>}
            {isHost && <button className="btn btn-primary btn-large" onClick={handleNextRound}>继续下一局 →</button>}
            {!isHost && <div className="niu-dealing-hint">等待房主继续…</div>}
          </div>
        )}

        {phase === 'banker_opt' && (
          <div className="niu2-banker-opt">
            <div className="niu2-banker-opt-title">已连庄 {gameState.bankerRounds} 局</div>
            {gameState.tableMsg && <div className="niu2-settle-summary">{gameState.tableMsg}</div>}
            <div className="niu2-banker-opt-info">底池当前有 <strong>{gameState.pool}</strong> 筹码，转庄可全部带走</div>
            {amBanker ? (
              <div className="niu2-banker-opt-btns">
                <button className="btn btn-primary" onClick={() => handleBankerOpt(true)}>继续当庄</button>
                <button className="btn" onClick={() => handleBankerOpt(false)}>转庄（带走底池）</button>
              </div>
            ) : (
              <div className="niu-dealing-hint">等待庄家决定…</div>
            )}
          </div>
        )}

        {phase === 'gameover' && (
          <div className="niu-gameover">
            <div className="niu-gameover-title">游戏结束</div>
            <div className="niu-gameover-actions">
              <button className="btn btn-primary" onClick={handleExit}>返回大厅</button>
            </div>
          </div>
        )}
      </div>

      <GameLog
        logs={gameLog}
        collapsed={logCollapsed}
        onToggle={() => setLogCollapsed(!logCollapsed)}
      />

      {/* 聊天框 */}
      {showChatBox && (
        <div className="chat-box">
          <div className="chat-header">
            <span>💬 聊天</span>
            <button className="chat-close" onClick={() => setShowChatBox(false)}>✕</button>
          </div>
          <div className="chat-messages">
            {chatMessages.length === 0 ? (
              <div className="chat-empty">暂无消息</div>
            ) : (
              chatMessages.map((msg, idx) => (
                <div key={idx} className={`chat-message ${msg.userId === user.userId ? 'own' : ''}`}>
                  <span className="chat-user">{msg.userName}:</span>
                  <span className="chat-text">{msg.message}</span>
                </div>
              ))
            )}
          </div>
          <form className="chat-input-form" onSubmit={handleSendChat}>
            <input
              type="text"
              className="chat-input"
              placeholder="输入消息..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              maxLength={200}
              autoComplete="off"
            />
            <button type="submit" className="chat-send-btn" disabled={!chatInput.trim()}>
              发送
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default NiuNiuOnlineGame;
