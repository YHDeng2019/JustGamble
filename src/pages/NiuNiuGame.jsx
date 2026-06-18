import React, { useState, useCallback } from 'react';
import { dealHands, evaluateHand, settle, aiDecideBet, HAND_NAMES, MULTIPLIERS, HAND_RANK } from '../game/niuNiuEngine';
import { getShuffledAIPlayers } from '../ai/personalities';
import { refreshSessionUser } from '../auth/session';
import { playSound } from '../game/sound';

const BASE_BET = 50;
const INIT_CHIPS = 2000;

const HAND_ICONS = {
  [HAND_RANK.WU_HUA_NIU]: '/icons/niu/wu_hua_niu.svg',
  [HAND_RANK.BOMB]:        '/icons/niu/bomb.svg',
  [HAND_RANK.WU_XIAO_NIU]:'/icons/niu/wu_xiao_niu.svg',
  [HAND_RANK.NIU_10]:      '/icons/niu/lao_niu.svg',
  [HAND_RANK.NO_NIU]:      '/icons/niu/no_niu.svg',
};

const isSpecial = (rank) => rank >= HAND_RANK.WU_XIAO_NIU;

function buildPlayers(playerCount, user) {
  const aiList = getShuffledAIPlayers(playerCount - 1);
  return [
    { id: 'human', name: user?.displayName || '你', avatar: user?.avatar || '😀', chips: INIT_CHIPS, isHuman: true },
    ...aiList.slice(0, playerCount - 1).map((ai, i) => ({
      id: `ai_${i}`, name: ai.name, avatar: ai.avatar, chips: INIT_CHIPS, isHuman: false, style: ai.style,
    }))
  ];
}

const PHASE = { IDLE: 'idle', REVEAL: 'reveal', RESULT: 'result' };

// 单张牌组件（扑克牌风格）
const NiuCard = ({ card, revealed, delay = 0 }) => {
  const isRed = card && ['♥', '♦'].includes(card.suit);
  return (
    <div
      className={`niu2-card${revealed ? ' revealed' : ' face-down'}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {revealed && card ? (
        <div className={`niu2-card-face${isRed ? ' red' : ''}`}>
          <div className="niu2-card-tl">{card.value}<br/>{card.suit}</div>
          <div className="niu2-card-center">{card.suit}</div>
          <div className="niu2-card-br">{card.value}<br/>{card.suit}</div>
        </div>
      ) : (
        <div className="niu2-card-back">
          <div className="niu2-card-back-inner" />
        </div>
      )}
    </div>
  );
};

// 单个座位组件
const NiuSeat = ({ player, hand, revealed, result, chg, bet, isBanker }) => {
  const handIcon = result ? HAND_ICONS[result.rank] : null;
  const seatClass = [
    'niu2-seat',
    isBanker ? 'banker' : '',
    player.isHuman ? 'human' : '',
    chg > 0 ? 'win-glow' : chg < 0 ? 'lose-glow' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={seatClass}>
      <div className="niu2-seat-top">
        <span className="niu2-avatar">{player.avatar}</span>
        <div className="niu2-seat-info">
          <div className="niu2-name">{player.name}</div>
          <div className="niu2-chips">{player.chips} 筹</div>
        </div>
        {isBanker && <span className="niu2-banker-tag">庄</span>}
        {bet > 0 && !isBanker && <span className="niu2-bet-tag">注 {bet}</span>}
      </div>

      <div className="niu2-hand">
        {hand.length > 0 ? hand.map((card, ci) => (
          <NiuCard key={card.id} card={card} revealed={revealed} delay={ci * 55} />
        )) : (
          Array.from({ length: 5 }).map((_, ci) => (
            <div key={ci} className="niu2-card face-down placeholder" />
          ))
        )}
      </div>

      {revealed && result && (
        <div className={`niu2-hand-name niu-rank-${result.rank}`}>
          {handIcon && <img src={handIcon} className="niu2-hand-icon" alt="" />}
          <span>{result.name}</span>
          {MULTIPLIERS[result.rank] > 1 && (
            <span className="niu2-multiplier">×{MULTIPLIERS[result.rank]}</span>
          )}
        </div>
      )}

      {chg !== null && chg !== 0 && (
        <div className={`niu2-change${chg > 0 ? ' win' : ' lose'}`}>
          {chg > 0 ? '+' : ''}{chg}
        </div>
      )}
    </div>
  );
};

const NiuNiuGame = ({ playerCount, onBack, stealthMode, soundEnabled }) => {
  const user = refreshSessionUser();
  const [players, setPlayers]           = useState(() => buildPlayers(playerCount, user));
  const [bankerIndex, setBankerIndex]   = useState(0);
  const [phase, setPhase]               = useState(PHASE.IDLE);
  const [hands, setHands]               = useState([]);
  const [handResults, setHandResults]   = useState([]);
  const [bets, setBets]                 = useState([]);
  const [humanBet, setHumanBet]         = useState(BASE_BET);
  const [changes, setChanges]           = useState(null);
  const [round, setRound]               = useState(1);
  const [revealStep, setRevealStep]     = useState(0);
  const [tableMsg, setTableMsg]         = useState('等待发牌…');
  const [gameOver, setGameOver]         = useState(false);
  const [specialFlash, setSpecialFlash] = useState(null);
  const [newBankerFlash, setNewBankerFlash] = useState(false);

  const isHumanBanker = bankerIndex === 0;

  const triggerSpecialEffect = useCallback((results) => {
    const top = results.filter(r => isSpecial(r.rank)).sort((a, b) => b.rank - a.rank)[0];
    if (!top) return;
    setSpecialFlash({ name: top.name, icon: HAND_ICONS[top.rank] || '' });
    playSound('niu_special', !soundEnabled);
    setTimeout(() => setSpecialFlash(null), 2000);
  }, [soundEnabled]);

  const resolveRound = useCallback((results, aiBets, pls, bankerIdx) => {
    const chg = settle(bankerIdx, results, aiBets);
    setChanges(chg);
    setPhase(PHASE.RESULT);

    const humanChange = chg[0];
    if (humanChange > 0) playSound('niu_win', !soundEnabled);
    else if (humanChange < 0) playSound('niu_lose', !soundEnabled);

    setPlayers(prev => prev.map((p, i) => ({ ...p, chips: Math.max(0, p.chips + chg[i]) })));

    const summary = pls.map((p, i) => {
      const sign = chg[i] >= 0 ? '+' : '';
      return `${p.name} ${results[i].name} ${sign}${chg[i]}`;
    }).join(' · ');
    setTableMsg(summary);
  }, [soundEnabled]);

  const runDeal = useCallback((bet, pls, bankerIdx) => {
    const dealt = dealHands(pls.length);
    const results = dealt.map(hand => evaluateHand(hand));
    const aiBets = pls.map((p, i) => {
      if (i === bankerIdx) return 0;
      if (p.isHuman) return Math.min(bet, p.chips);
      return Math.min(aiDecideBet(BASE_BET), p.chips);
    });

    setHands(dealt);
    setHandResults(results);
    setBets(aiBets);
    setRevealStep(0);
    setChanges(null);
    setTableMsg('翻牌中…');
    setPhase(PHASE.REVEAL);
    playSound('niu_deal', !soundEnabled);

    let step = 0;
    const timer = setInterval(() => {
      step++;
      setRevealStep(step);
      playSound('niu_reveal', !soundEnabled);
      if (step >= pls.length) {
        clearInterval(timer);
        const hasSpecial = results.some(r => isSpecial(r.rank));
        const hasNiu = results.some(r => r.rank > HAND_RANK.NO_NIU);
        setTimeout(() => {
          if (hasSpecial) {
            triggerSpecialEffect(results);
            setTimeout(() => resolveRound(results, aiBets, pls, bankerIdx), 2100);
          } else {
            if (hasNiu) playSound('niu_niu', !soundEnabled);
            else playSound('niu_no_niu', !soundEnabled);
            setTimeout(() => resolveRound(results, aiBets, pls, bankerIdx), 700);
          }
        }, 300);
      }
    }, 480);
  }, [soundEnabled, resolveRound, triggerSpecialEffect]);

  const handleDeal = () => {
    if (phase !== PHASE.IDLE) return;
    playSound('niu_bet', !soundEnabled);
    runDeal(humanBet, players, bankerIndex);
  };

  const handleHumanBet = (bet) => {
    setHumanBet(bet);
    playSound('niu_bet', !soundEnabled);
    runDeal(bet, players, bankerIndex);
  };

  const nextRound = () => {
    const nextBanker = (bankerIndex + 1) % players.length;
    setBankerIndex(nextBanker);
    setRound(r => r + 1);
    setPhase(PHASE.IDLE);
    setChanges(null);
    setRevealStep(0);
    setTableMsg('等待发牌…');
    setNewBankerFlash(true);
    playSound('niu_banker', !soundEnabled);
    setTimeout(() => setNewBankerFlash(false), 1200);
    if (players.some(p => p.chips <= 0)) setGameOver(true);
  };

  const resetGame = () => {
    setPlayers(buildPlayers(playerCount, user));
    setBankerIndex(0);
    setPhase(PHASE.IDLE);
    setRound(1);
    setChanges(null);
    setTableMsg('等待发牌…');
    setGameOver(false);
    setHumanBet(BASE_BET);
    setSpecialFlash(null);
    setRevealStep(0);
  };

  // 分离庄家和闲家
  const bankerPlayer = players[bankerIndex];
  const idlePlayers = players.filter((_, i) => i !== bankerIndex);
  const bankerHand = hands[bankerIndex] || [];
  const bankerResult = handResults[bankerIndex];
  const bankerChg = changes ? changes[bankerIndex] : null;
  const bankerBet = bets[bankerIndex] || 0;

  const nextBankerName = players[(bankerIndex + 1) % players.length]?.name;

  return (
    <div className={`niu2-page${stealthMode ? ' stealth-mode' : ''}`}>
      {/* 特殊牌型全屏特效 */}
      {specialFlash && (
        <div className="niu-special-flash">
          {specialFlash.icon && <img src={specialFlash.icon} className="niu-special-flash-icon" alt="" />}
          <div className="niu-special-flash-name">{specialFlash.name}！</div>
        </div>
      )}

      {/* 庄家变更提示 */}
      {newBankerFlash && (
        <div className="niu-banker-flash">
          <img src="/icons/niu/niu_niu_logo.svg" className="niu-banker-flash-icon" alt="" />
          <span>{nextBankerName} 成为新庄家</span>
        </div>
      )}

      {/* 顶部栏 */}
      <div className="niu2-header">
        <button className="btn btn-icon" onClick={onBack}>←</button>
        <div className="niu2-title">
          <img src="/icons/niu/niu_niu_logo.svg" className="niu-title-logo" alt="斗牛" />
          斗牛
        </div>
        <div className="niu2-round">第 {round} 局</div>
      </div>

      {/* 牌桌区域 */}
      <div className="niu2-table-area">
        {/* 庄家（顶部居中） */}
        <div className="niu2-banker-row">
          <NiuSeat
            player={bankerPlayer}
            hand={bankerHand}
            revealed={revealStep > bankerIndex}
            result={bankerResult}
            chg={bankerChg}
            bet={bankerBet}
            isBanker={true}
          />
        </div>

        {/* 椭圆绿色桌面 */}
        <div className="niu2-felt">
          <div className="niu2-felt-info">{tableMsg}</div>
        </div>

        {/* 闲家（底部横排） */}
        <div className="niu2-players-row">
          {idlePlayers.map((player) => {
            const origIdx = players.findIndex(p => p.id === player.id);
            return (
              <NiuSeat
                key={player.id}
                player={player}
                hand={hands[origIdx] || []}
                revealed={revealStep > origIdx}
                result={handResults[origIdx]}
                chg={changes ? changes[origIdx] : null}
                bet={bets[origIdx] || 0}
                isBanker={false}
              />
            );
          })}
        </div>
      </div>

      {/* 操作区 */}
      <div className="niu2-controls">
        {phase === PHASE.IDLE && !gameOver && (
          isHumanBanker ? (
            <button className="btn btn-primary btn-large" onClick={handleDeal}>
              🐂 发牌（你是庄家）
            </button>
          ) : (
            <div className="niu-bet-controls">
              <div className="niu-bet-title">你的下注</div>
              <div className="niu-bet-options">
                {[50, 100, 200, 500].map(v => (
                  <button
                    key={v}
                    className={`niu-bet-btn${humanBet === v ? ' selected' : ''}`}
                    disabled={players[0].chips < v}
                    onClick={() => setHumanBet(v)}
                  >{v}</button>
                ))}
              </div>
              <button className="btn btn-primary btn-large" onClick={() => handleHumanBet(humanBet)}>
                确认下注 {humanBet}
              </button>
            </div>
          )
        )}

        {phase === PHASE.REVEAL && (
          <div className="niu-dealing-hint">翻牌中…</div>
        )}

        {phase === PHASE.RESULT && !gameOver && (
          <button className="btn btn-primary btn-large" onClick={nextRound}>
            下一局 →
          </button>
        )}

        {gameOver && (
          <div className="niu-gameover">
            <div className="niu-gameover-title">
              {players[0].chips <= 0 ? '💸 你破产了！' : '🏆 对手破产，你赢了！'}
            </div>
            <div className="niu-gameover-actions">
              <button className="btn btn-primary" onClick={resetGame}>再来一局</button>
              <button className="btn" onClick={onBack}>返回</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NiuNiuGame;
