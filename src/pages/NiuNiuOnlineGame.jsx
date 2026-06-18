import React, { useState, useEffect, useRef } from 'react';
import { NiuNiuOnlineEngine } from '../game/niuNiuOnlineEngine';
import { subscribeToRoom, leaveRoom } from '../services/roomService';
import { getFirebaseDB } from '../services/firebase';
import { ref, remove } from 'firebase/database';import { HAND_NAMES, MULTIPLIERS, HAND_RANK, BASE_BET, BANKER_ANTE, isSpecialHand } from '../game/niuNiuEngine';
import { playSound } from '../game/sound';
import Avatar from '../ui/Avatar';
import Card from '../ui/Card';

const HAND_ICONS = {
  [HAND_RANK.WU_HUA_NIU]:  '/icons/niu/wu_hua_niu.svg',
  [HAND_RANK.BOMB]:         '/icons/niu/bomb.svg',
  [HAND_RANK.WU_XIAO_NIU]: '/icons/niu/wu_xiao_niu.svg',
  [HAND_RANK.NIU_NIU]:      '/icons/niu/lao_niu.svg',
  [HAND_RANK.NO_NIU]:       '/icons/niu/no_niu.svg',
};

// 单张牌 — 使用共享 Card 组件
const NiuCard = ({ card, revealed, delay = 0 }) => (
  <div className="niu2-card-wrapper" style={{ animationDelay: `${delay}ms` }}>
    <Card card={card} flipped={!revealed} size="mini" />
  </div>
);

const NiuSeat = ({ player, hand, revealedCount, seatIdx, result, chg, bet, isBanker, isMe }) => {
  const revealed = revealedCount > seatIdx;
  const handIcon = result ? HAND_ICONS[result.rank] : null;
  const cls = ['niu2-seat', isBanker && 'banker', isMe && 'human',
    chg > 0 ? 'win-glow' : chg < 0 ? 'lose-glow' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="niu2-seat-top">
        <Avatar avatar={player.avatar} size="md" />
        <div className="niu2-seat-info">
          <div className="niu2-name">{player.name}{isMe ? ' (你)' : ''}</div>
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

const NiuNiuOnlineGame = ({ roomId, user, onExit, stealthMode, soundEnabled }) => {
  const [gameState, setGameState] = useState(null);
  const [room, setRoom]           = useState(null);
  const [humanBet, setHumanBet]   = useState(BASE_BET);
  const [error, setError]         = useState('');
  const [specialFlash, setSpecialFlash] = useState(null);
  const engineRef = useRef(null);
  const prevPhaseRef = useRef('');

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

  // 音效触发
  useEffect(() => {
    if (!gameState) return;
    const phase = gameState.phase;
    const prev  = prevPhaseRef.current;
    if (phase !== prev) {
      if (phase === 'reveal') playSound('niu_deal', !soundEnabled);
      if (phase === 'settle') {
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
      }
      prevPhaseRef.current = phase;
    }
  }, [gameState?.phase]);

  const handleExit = async () => {
    await leaveRoom(roomId, user.userId);
    // 清理斗牛状态
    try {
      const db = getFirebaseDB();
      if (isHost) await remove(ref(db, `rooms/${roomId}/niuState`));
    } catch {}
    onExit();
  };

  const handleBet = (amount) => {
    setHumanBet(amount);
  };

  const handleConfirmBet = () => {
    engineRef.current?.pushAction({ type: 'bet', amount: Math.min(humanBet, myPlayer?.chips || humanBet) });
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

  const betOptions   = [100, 200, 500].filter(v => v <= (myPlayer?.chips || 0));
  if (betOptions.length === 0) betOptions.push(Math.min(100, myPlayer?.chips || 100));

  // 是否已提交下注
  const myBet = bets[myIdx] || 0;
  const hasSubmittedBet = phase === 'reveal' || phase === 'settle' || phase === 'banker_opt' || myBet > 0;

  return (
    <div className={`niu2-page${stealthMode ? ' stealth-mode' : ''}`}>
      {specialFlash && (
        <div className="niu-special-flash">
          {specialFlash.icon && <img src={specialFlash.icon} className="niu-special-flash-icon" alt="" />}
          <div className="niu-special-flash-name">{specialFlash.name}！</div>
        </div>
      )}

      <div className="niu2-header">
        <button className="btn btn-icon" onClick={handleExit}>←</button>
        <div className="niu2-title">
          <img src="/icons/niu/niu_niu_logo.svg" className="niu-title-logo" alt="斗牛" />
          斗牛联机
        </div>
        <div className="niu2-round">
          第 {gameState.round || 1} 局
          {gameState.pool > 0 && <span className="niu2-pool-badge">底池 {gameState.pool}</span>}
        </div>
      </div>

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
          />
        </div>

        <div className="niu2-felt">
          <div className="niu2-felt-pool">
            {gameState.pool > 0 ? `💰 底池 ${gameState.pool}` : gameState.tableMsg || (phase === 'idle' ? '等待发牌' : '')}
          </div>
          {gameState.bankerRounds > 0 && (
            <div className="niu2-felt-rounds">庄家已连庄 {gameState.bankerRounds} 局</div>
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
              {isHost ? (
                <button className="btn btn-primary btn-large" onClick={handleBankerDeal}>🐂 发牌</button>
              ) : (
                <div className="niu-dealing-hint">等待庄家发牌…</div>
              )}
            </div>
          ) : (
            !hasSubmittedBet ? (
              <div className="niu-bet-controls">
                <div className="niu-bet-title">选择下注</div>
                <div className="niu-bet-options">
                  {betOptions.map(v => (
                    <button key={v} className={`niu-bet-btn${humanBet === v ? ' selected' : ''}`} onClick={() => handleBet(v)}>{v}</button>
                  ))}
                </div>
                <button className="btn btn-primary btn-large" onClick={handleConfirmBet}>确认 {humanBet}</button>
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
            {amBanker ? (
              <div className="niu2-banker-opt-btns">
                <button className="btn btn-primary" onClick={() => handleBankerOpt(true)}>继续当庄</button>
                <button className="btn" onClick={() => handleBankerOpt(false)}>转庄</button>
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
    </div>
  );
};

export default NiuNiuOnlineGame;
