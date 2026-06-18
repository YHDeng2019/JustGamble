import React, { useState, useCallback } from 'react';
import { dealHands, evaluateHand, settle, aiDecideBet, HAND_NAMES, MULTIPLIERS, HAND_RANK } from '../game/niuNiuEngine';
import { getShuffledAIPlayers } from '../ai/personalities';
import { refreshSessionUser } from '../auth/session';
import { playSound } from '../game/sound';

const BASE_BET = 50;
const INIT_CHIPS = 2000;

// 牌型图标映射
const HAND_ICONS = {
  [HAND_RANK.WU_HUA_NIU]: '/icons/niu/wu_hua_niu.svg',
  [HAND_RANK.BOMB]:       '/icons/niu/bomb.svg',
  [HAND_RANK.WU_XIAO_NIU]:'/icons/niu/wu_xiao_niu.svg',
  [HAND_RANK.NIU_10]:     '/icons/niu/lao_niu.svg',
  [HAND_RANK.NO_NIU]:     '/icons/niu/no_niu.svg',
};

// 是否特殊牌型（触发全屏特效）
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
  const [msg, setMsg]                   = useState('');
  const [gameOver, setGameOver]         = useState(false);
  const [specialFlash, setSpecialFlash] = useState(null); // { name, icon }
  const [newBankerFlash, setNewBankerFlash] = useState(false);

  const isHumanBanker = bankerIndex === 0;

  const triggerSpecialEffect = useCallback((results) => {
    // 找出最高特殊牌型
    const specials = results
      .filter(r => isSpecial(r.rank))
      .sort((a, b) => b.rank - a.rank);
    if (specials.length === 0) return;
    const top = specials[0];
    setSpecialFlash({ name: top.name, icon: HAND_ICONS[top.rank] || '' });
    playSound('niu_special', !soundEnabled);
    setTimeout(() => setSpecialFlash(null), 2000);
  }, [soundEnabled]);

  const resolveRound = useCallback((results, aiBets, _dealt, pls, bankerIdx) => {
    const chg = settle(bankerIdx, results, aiBets);
    setChanges(chg);
    setPhase(PHASE.RESULT);

    const humanChange = chg[0];
    if (humanChange > 0) playSound('niu_win', !soundEnabled);
    else if (humanChange < 0) playSound('niu_lose', !soundEnabled);

    setPlayers(prev => prev.map((p, i) => ({
      ...p,
      chips: Math.max(0, p.chips + chg[i])
    })));

    const lines = pls.map((p, i) => {
      const tag = i === bankerIdx ? '（庄）' : '';
      const sign = chg[i] >= 0 ? '+' : '';
      return `${p.name}${tag} ${results[i].name} ${sign}${chg[i]}`;
    });
    setMsg(lines.join(' | '));
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
    setPhase(PHASE.REVEAL);
    playSound('niu_deal', !soundEnabled);

    let step = 0;
    const timer = setInterval(() => {
      step++;
      setRevealStep(step);
      playSound('niu_reveal', !soundEnabled);
      if (step >= pls.length) {
        clearInterval(timer);
        // 检查并播放特殊牌型特效
        const hasSpecial = results.some(r => isSpecial(r.rank));
        const hasNiu     = results.some(r => r.rank > HAND_RANK.NO_NIU);
        setTimeout(() => {
          if (hasSpecial) {
            triggerSpecialEffect(results);
            setTimeout(() => resolveRound(results, aiBets, dealt, pls, bankerIdx), 2100);
          } else {
            if (hasNiu) playSound('niu_niu', !soundEnabled);
            else playSound('niu_no_niu', !soundEnabled);
            setTimeout(() => resolveRound(results, aiBets, dealt, pls, bankerIdx), 700);
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
    setMsg('');
    setRevealStep(0);

    // 庄家变更提示
    setNewBankerFlash(true);
    playSound('niu_banker', !soundEnabled);
    setTimeout(() => setNewBankerFlash(false), 1200);

    const anyOut = players.some(p => p.chips <= 0);
    if (anyOut) setGameOver(true);
  };

  const resetGame = () => {
    const newPlayers = buildPlayers(playerCount, user);
    setPlayers(newPlayers);
    setBankerIndex(0);
    setPhase(PHASE.IDLE);
    setRound(1);
    setChanges(null);
    setMsg('');
    setGameOver(false);
    setHumanBet(BASE_BET);
    setSpecialFlash(null);
  };

  const cardColor = (suit) => ['♥', '♦'].includes(suit) ? '#ff4757' : '#222';

  const nextBankerName = players[(bankerIndex + 1) % players.length]?.name;

  return (
    <div className={`niu-game-page${stealthMode ? ' stealth-mode' : ''}`}>
      {/* 特殊牌型全屏特效 */}
      {specialFlash && (
        <div className="niu-special-flash">
          {specialFlash.icon && (
            <img src={specialFlash.icon} className="niu-special-flash-icon" alt="" />
          )}
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

      <div className="niu-header">
        <button className="btn btn-icon" onClick={onBack}>←</button>
        <div className="niu-title">
          <img src="/icons/niu/niu_niu_logo.svg" className="niu-title-logo" alt="斗牛" />
          斗牛
        </div>
        <div className="niu-round">第 {round} 局</div>
      </div>

      <div className="niu-table">
        {players.map((player, i) => {
          const isBanker = i === bankerIndex;
          const hand = hands[i] || [];
          const revealed = revealStep > i;
          const result = handResults[i];
          const chg = changes ? changes[i] : null;
          const handIcon = result ? HAND_ICONS[result.rank] : null;

          return (
            <div key={player.id} className={`niu-seat${isBanker ? ' banker' : ''}${player.isHuman ? ' human' : ''}${chg > 0 ? ' win-glow' : chg < 0 ? ' lose-glow' : ''}`}>
              <div className="niu-player-info">
                <span className="niu-avatar">{player.avatar}</span>
                <span className="niu-name">{player.name}</span>
                {isBanker && <span className="niu-banker-badge">庄</span>}
                <span className="niu-chips">{player.chips}</span>
              </div>

              <div className="niu-hand">
                {hand.length > 0 ? hand.map((card, ci) => (
                  <div
                    key={card.id}
                    className={`niu-card${revealed ? ' revealed' : ' face-down'}`}
                    style={{ animationDelay: `${ci * 60}ms` }}
                  >
                    {revealed ? (
                      <span className="niu-card-value" style={{ color: cardColor(card.suit) }}>
                        {card.suit}<br/>{card.value}
                      </span>
                    ) : (
                      <span className="niu-card-back">🀫</span>
                    )}
                  </div>
                )) : (
                  // 占位空牌
                  Array.from({ length: 5 }).map((_, ci) => (
                    <div key={ci} className="niu-card niu-card-placeholder" />
                  ))
                )}
              </div>

              {revealed && result && (
                <div className={`niu-hand-name niu-rank-${result.rank}`}>
                  {handIcon && <img src={handIcon} className="niu-hand-icon" alt="" />}
                  {result.name}
                  {MULTIPLIERS[result.rank] > 1 && (
                    <span className="niu-multiplier"> ×{MULTIPLIERS[result.rank]}</span>
                  )}
                </div>
              )}

              {chg !== null && (
                <div className={`niu-change${chg > 0 ? ' win' : chg < 0 ? ' lose' : ' draw'}`}>
                  {chg > 0 ? '+' : ''}{chg}
                </div>
              )}

              {!isBanker && bets[i] > 0 && phase !== PHASE.IDLE && (
                <div className="niu-bet-label">注: {bets[i]}</div>
              )}
            </div>
          );
        })}
      </div>

      {msg && <div className="niu-msg">{msg}</div>}

      <div className="niu-controls">
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
