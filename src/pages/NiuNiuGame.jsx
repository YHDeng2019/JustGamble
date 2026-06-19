import React, { useState, useCallback, useRef } from 'react';
import {
  dealHands, evaluateHand, settleWithPool, aiDecideBet, findNextBanker,
  HAND_NAMES, MULTIPLIERS, HAND_RANK, INIT_CHIPS, BASE_BET, BANKER_ANTE,
  BANKER_MIN_CHIPS, BANKER_MAX_ROUNDS, isSpecialHand,
} from '../game/niuNiuEngine';
import { getShuffledAIPlayers } from '../ai/personalities';
import { refreshSessionUser } from '../auth/session';
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

function buildPlayers(playerCount, user) {
  const aiList = getShuffledAIPlayers(playerCount - 1);
  return [
    { id: 'human', name: user?.displayName || '你', avatar: user?.avatar || '😀', chips: INIT_CHIPS, isHuman: true },
    ...aiList.slice(0, playerCount - 1).map((ai, i) => ({
      id: `ai_${i}`, name: ai.name, avatar: ai.avatar, chips: INIT_CHIPS, isHuman: false, style: ai.style,
    }))
  ];
}

const PHASE = {
  IDLE:       'idle',
  BETTING:    'betting',
  REVEAL:     'reveal',
  SETTLE:     'settle',
  BANKER_OPT: 'banker_opt',
};

// 座位组件 — 使用 Card 组件渲染手牌
const NiuSeat = ({ player, hand, revealed, result, chg, bet, isBanker }) => {
  const handIcon = result ? HAND_ICONS[result.rank] : null;
  const cls = ['niu2-seat', isBanker && 'banker', player.isHuman && 'human',
    chg > 0 ? 'win-glow' : chg < 0 ? 'lose-glow' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="niu2-seat-top">
        <Avatar avatar={player.avatar} size="md" />
        <div className="niu2-seat-info">
          <div className="niu2-name">{player.name}</div>
          <div className="niu2-chips">{player.chips} 筹</div>
        </div>
        {isBanker && <span className="niu2-banker-tag">庄</span>}
        {bet > 0 && !isBanker && <span className="niu2-bet-tag">注 {bet}</span>}
      </div>

      <div className="niu2-hand">
        {hand.length > 0 ? hand.map((card, ci) => (
          <div key={card.id} className="niu2-card-wrapper" style={{ animationDelay: `${ci * 55}ms` }}>
            <Card
              card={card}
              flipped={!revealed}
              size="mini"
            />
          </div>
        )) : Array.from({ length: 5 }).map((_, ci) => (
          <div key={ci} className="niu2-card-wrapper">
            <Card card={null} flipped={true} size="mini" />
          </div>
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

const NiuNiuGame = ({ playerCount, onBack, stealthMode, soundEnabled }) => {
  const user = refreshSessionUser();
  const [players, setPlayers]             = useState(() => buildPlayers(playerCount, user));
  const [bankerIndex, setBankerIndex]     = useState(0);
  const [bankerRounds, setBankerRounds]   = useState(0);
  // pool 在庄家上任时一次性扣入，整个当庄期间保持，直到流庄/转庄才清零
  const [pool, setPool]                   = useState(0);
  const [bankerAnteDeducted, setBankerAnteDeducted] = useState(false); // 本次当庄是否已扣过底池
  const [phase, setPhase]                 = useState(PHASE.IDLE);
  const [hands, setHands]                 = useState([]);
  const [handResults, setHandResults]     = useState([]);
  const [bets, setBets]                   = useState([]);
  const [humanBet, setHumanBet]           = useState(BASE_BET);
  const [humanBetInput, setHumanBetInput] = useState(String(BASE_BET));
  const [changes, setChanges]             = useState(null);
  const [round, setRound]                 = useState(1);
  const [revealStep, setRevealStep]       = useState(0);
  const [tableMsg, setTableMsg]           = useState('');
  const [gameOver, setGameOver]           = useState(false);
  const [specialFlash, setSpecialFlash]   = useState(null);
  const [newBankerFlash, setNewBankerFlash] = useState(null);

  const playersRef  = useRef(players);
  const bankerRef   = useRef(bankerIndex);
  const poolRef     = useRef(pool);
  const roundsRef   = useRef(bankerRounds);
  const anteRef     = useRef(false);

  const syncRefs = (pls, bi, po, br, ante) => {
    playersRef.current  = pls;
    bankerRef.current   = bi;
    poolRef.current     = po;
    roundsRef.current   = br;
    anteRef.current     = ante;
  };

  const isHumanBanker = bankerIndex === 0;

  const triggerSpecialEffect = useCallback((results) => {
    const top = results.filter(r => isSpecialHand(r.rank)).sort((a, b) => b.rank - a.rank)[0];
    if (!top) return;
    setSpecialFlash({ name: top.name, icon: HAND_ICONS[top.rank] || '' });
    playSound('niu_special', !soundEnabled);
    setTimeout(() => setSpecialFlash(null), 2000);
  }, [soundEnabled]);

  // pool 在 runRound 时传入（不再每局修改，仅结算时更新）
  const resolveRound = useCallback((results, aiBets, pls, bankerIdx, currentPool) => {
    const chips = pls.map(p => p.chips);
    const { changes: chg } = settleWithPool(bankerIdx, results, aiBets, chips, currentPool);

    // 计算底池变化：输家放入 - 赢家取走，剩余归庄
    // chg 已包含所有变化（含庄家入池已在前面扣除）
    // 新底池 = 0（全部分完了，含庄家 chg 里的剩余）
    const newPls = pls.map((p, i) => ({ ...p, chips: Math.max(0, p.chips + chg[i]) }));
    setPlayers(newPls);
    setChanges(chg);
    setPool(0);

    const newRounds = roundsRef.current + 1;
    syncRefs(newPls, bankerIdx, 0, newRounds, anteRef.current);
    setBankerRounds(newRounds);

    const summary = pls.map((p, i) => {
      const s = chg[i] >= 0 ? '+' : '';
      return `${p.name} ${results[i].name} ${s}${chg[i]}`;
    }).join(' · ');
    setTableMsg(summary);

    if (chg[0] > 0) playSound('niu_win', !soundEnabled);
    else if (chg[0] < 0) playSound('niu_lose', !soundEnabled);

    if (newRounds >= BANKER_MAX_ROUNDS && !newPls[bankerIdx].isHuman) {
      checkFlow(newPls, bankerIdx, 0, newRounds);
    } else {
      setPhase(PHASE.SETTLE);
    }
  }, [soundEnabled]);

  const runRound = useCallback((betMap, pls, bankerIdx, currentPool) => {
    const dealt = dealHands(pls.length);
    const results = dealt.map(h => evaluateHand(h));
    const betsArr = pls.map((p, i) => i === bankerIdx ? 0 : (betMap[p.id] || BASE_BET));

    setHands(dealt);
    setHandResults(results);
    setBets(betsArr);
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
        const hasSpecial = results.some(r => isSpecialHand(r.rank));
        const hasNiu = results.some(r => r.rank > HAND_RANK.NO_NIU);
        const afterReveal = () => resolveRound(results, betsArr, pls, bankerIdx, currentPool);
        setTimeout(() => {
          if (hasSpecial) {
            triggerSpecialEffect(results);
            setTimeout(afterReveal, 2100);
          } else {
            if (hasNiu) playSound('niu_niu', !soundEnabled);
            else playSound('niu_no_niu', !soundEnabled);
            setTimeout(afterReveal, 700);
          }
        }, 300);
      }
    }, 480);
  }, [soundEnabled, resolveRound, triggerSpecialEffect]);

  const checkFlow = (pls, bankerIdx, curPool, rounds) => {
    const banker = pls[bankerIdx];
    if (banker.chips < BANKER_MIN_CHIPS) {
      doChangeBanker(pls, bankerIdx, false);
      return;
    }
    if (rounds >= BANKER_MAX_ROUNDS && banker.isHuman) {
      setPhase(PHASE.BANKER_OPT);
      return;
    }
    if (rounds >= BANKER_MAX_ROUNDS) {
      doChangeBanker(pls, bankerIdx, false);
      return;
    }
    setPhase(PHASE.SETTLE);
  };

  const doChangeBanker = (pls, oldBankerIdx, keepBanker) => {
    const nextIdx = findNextBanker(pls, oldBankerIdx);
    if (nextIdx === -1) {
      setGameOver(true);
      return;
    }
    const nextName = pls[nextIdx].name;
    setBankerIndex(nextIdx);
    setBankerRounds(0);
    setPool(0);
    setBankerAnteDeducted(false);
    setPhase(PHASE.IDLE);
    setChanges(null);
    setRevealStep(0);
    setTableMsg('');
    setRound(r => r + 1);
    setNewBankerFlash(nextName);
    playSound('niu_banker', !soundEnabled);
    setTimeout(() => setNewBankerFlash(null), 1400);
    syncRefs(pls, nextIdx, 0, 0, false);
    if (pls.some(p => p.chips <= 0)) setGameOver(true);
  };

  // 庄家确认发牌（扣一次底池，后续不再扣）
  const handleDeal = () => {
    if (phase !== PHASE.IDLE) return;
    const pls = playersRef.current;
    const bi = bankerRef.current;
    const banker = pls[bi];
    if (banker.chips < BANKER_ANTE && !anteRef.current) {
      doChangeBanker(pls, bi, false);
      return;
    }

    let newPls = pls;
    let currentPool = poolRef.current;

    // 只在首次当庄时扣底池
    if (!anteRef.current) {
      newPls = pls.map((p, i) => i === bi ? { ...p, chips: p.chips - BANKER_ANTE } : p);
      currentPool = BANKER_ANTE;
      setPlayers(newPls);
      setPool(BANKER_ANTE);
      setBankerAnteDeducted(true);
      syncRefs(newPls, bi, currentPool, roundsRef.current, true);
    }

    playSound('niu_bet', !soundEnabled);
    const betMap = {};
    newPls.forEach((p, i) => {
      if (i !== bi && !p.isHuman) {
        betMap[p.id] = aiDecideBet(BASE_BET, p.chips);
      }
    });
    runRound(betMap, newPls, bi, currentPool);
  };

  const handleHumanBet = () => {
    const bet = Math.max(1, Math.min(parseInt(humanBetInput) || BASE_BET, players[0]?.chips || 0));
    setHumanBet(bet);
    setHumanBetInput(String(bet));

    const pls = playersRef.current;
    const bi = bankerRef.current;
    const banker = pls[bi];

    if (banker.chips < BANKER_ANTE && !anteRef.current) {
      doChangeBanker(pls, bi, false);
      return;
    }

    let newPls = pls;
    let currentPool = poolRef.current;

    if (!anteRef.current) {
      newPls = pls.map((p, i) => i === bi ? { ...p, chips: p.chips - BANKER_ANTE } : p);
      currentPool = BANKER_ANTE;
      setPlayers(newPls);
      setPool(BANKER_ANTE);
      setBankerAnteDeducted(true);
      syncRefs(newPls, bi, currentPool, roundsRef.current, true);
    }

    playSound('niu_bet', !soundEnabled);
    const betMap = { human: bet };
    newPls.forEach((p, i) => {
      if (i !== bi && !p.isHuman) {
        betMap[p.id] = aiDecideBet(BASE_BET, p.chips);
      }
    });
    runRound(betMap, newPls, bi, currentPool);
  };

  const handleNextRound = () => {
    const pls = playersRef.current;
    const bi = bankerRef.current;
    const banker = pls[bi];
    if (banker.chips < BANKER_MIN_CHIPS) {
      doChangeBanker(pls, bi, false);
      return;
    }
    setPhase(PHASE.IDLE);
    setChanges(null);
    setRevealStep(0);
    setTableMsg('');
    setRound(r => r + 1);
  };

  const handleBankerOption = (keepBanker) => {
    const pls = playersRef.current;
    const bi = bankerRef.current;
    if (keepBanker) {
      setBankerRounds(0);
      syncRefs(pls, bi, poolRef.current, 0, anteRef.current);
      setPhase(PHASE.IDLE);
      setChanges(null);
      setRevealStep(0);
      setTableMsg('');
      setRound(r => r + 1);
    } else {
      doChangeBanker(pls, bi, false);
    }
  };

  const resetGame = () => {
    const newPls = buildPlayers(playerCount, user);
    setPlayers(newPls);
    setBankerIndex(0);
    setBankerRounds(0);
    setPool(0);
    setBankerAnteDeducted(false);
    setPhase(PHASE.IDLE);
    setRound(1);
    setChanges(null);
    setTableMsg('');
    setGameOver(false);
    setHumanBet(BASE_BET);
    setHumanBetInput(String(BASE_BET));
    setSpecialFlash(null);
    setRevealStep(0);
    syncRefs(newPls, 0, 0, 0, false);
  };

  const bankerPlayer   = players[bankerIndex];
  const idlePlayers    = players.filter((_, i) => i !== bankerIndex);
  const bankerHand     = hands[bankerIndex] || [];
  const bankerResult   = handResults[bankerIndex];
  const bankerChg      = changes ? changes[bankerIndex] : null;
  const humanChips     = players[0]?.chips || 0;

  return (
    <div className={`niu2-page${stealthMode ? ' stealth-mode' : ''}`}>
      {specialFlash && (
        <div className="niu-special-flash">
          {specialFlash.icon && <img src={specialFlash.icon} className="niu-special-flash-icon" alt="" />}
          <div className="niu-special-flash-name">{specialFlash.name}！</div>
        </div>
      )}
      {newBankerFlash && (
        <div className="niu-banker-flash">
          <img src="/icons/niu/niu_niu_logo.svg" className="niu-banker-flash-icon" alt="" />
          <span>{newBankerFlash} 成为新庄家</span>
        </div>
      )}

      <div className="niu2-header">
        <button className="btn btn-icon" onClick={onBack}>←</button>
        <div className="niu2-title">
          <img src="/icons/niu/niu_niu_logo.svg" className="niu-title-logo" alt="斗牛" />
          斗牛
        </div>
        <div className="niu2-round">
          第 {round} 局
          {pool > 0 && <span className="niu2-pool-badge">底池 {pool}</span>}
        </div>
      </div>

      <div className="niu2-table-area">
        <div className="niu2-banker-row">
          <NiuSeat
            player={bankerPlayer}
            hand={bankerHand}
            revealed={revealStep > bankerIndex}
            result={bankerResult}
            chg={bankerChg}
            bet={0}
            isBanker={true}
          />
        </div>

        <div className="niu2-felt">
          {pool > 0 ? (
            <div className="niu2-pot" key={pool}>
              <div className="niu2-pot-chips">
                <span className="niu2-pot-chip niu2-pot-chip-3" />
                <span className="niu2-pot-chip niu2-pot-chip-2" />
                <span className="niu2-pot-chip niu2-pot-chip-1" />
              </div>
              <div className="niu2-pot-text">
                <span className="niu2-pot-label">底池</span>
                <span className="niu2-pot-amount">{pool}</span>
              </div>
            </div>
          ) : (
            <div className="niu2-felt-pool">
              {tableMsg || (phase === PHASE.IDLE ? '等待发牌' : '')}
            </div>
          )}
          {bankerRounds > 0 && (
            <div className="niu2-felt-rounds">庄 {bankerRounds} 局</div>
          )}
        </div>

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

      <div className="niu2-controls">
        {phase === PHASE.IDLE && !gameOver && (
          isHumanBanker ? (
            <div className="niu2-banker-controls">
              <div className="niu2-info-row">
                {bankerAnteDeducted
                  ? '继续当庄，底池沿用'
                  : <>本轮当庄需放入 <strong>{BANKER_ANTE}</strong> 入底池</>
                }
              </div>
              <button className="btn btn-primary btn-large" onClick={handleDeal}>
                🐂 发牌开局
              </button>
            </div>
          ) : (
            <div className="niu-bet-controls">
              <div className="niu-bet-title">你的下注（最多 {humanChips}）</div>
              <div className="niu2-bet-input-row">
                <input
                  type="number"
                  className="niu2-bet-input"
                  value={humanBetInput}
                  min={1}
                  max={humanChips}
                  onChange={e => setHumanBetInput(e.target.value)}
                  onBlur={() => {
                    const v = Math.max(1, Math.min(parseInt(humanBetInput) || BASE_BET, humanChips));
                    setHumanBet(v);
                    setHumanBetInput(String(v));
                  }}
                />
                <div className="niu2-bet-presets">
                  {[100, 200, 500].filter(v => v <= humanChips).map(v => (
                    <button key={v} className={`niu-bet-btn${humanBet === v ? ' selected' : ''}`}
                      onClick={() => { setHumanBet(v); setHumanBetInput(String(v)); }}>{v}</button>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary btn-large" onClick={handleHumanBet}>
                确认下注 {humanBet}
              </button>
            </div>
          )
        )}

        {phase === PHASE.REVEAL && (
          <div className="niu-dealing-hint">翻牌中…</div>
        )}

        {phase === PHASE.SETTLE && !gameOver && (
          <div className="niu2-settle-controls">
            {tableMsg && <div className="niu2-settle-summary">{tableMsg}</div>}
            <button className="btn btn-primary btn-large" onClick={handleNextRound}>
              继续下一局 →
            </button>
          </div>
        )}

        {phase === PHASE.BANKER_OPT && !gameOver && (
          <div className="niu2-banker-opt">
            <div className="niu2-banker-opt-title">已连庄 {bankerRounds} 局</div>
            {tableMsg && <div className="niu2-settle-summary">{tableMsg}</div>}
            <div className="niu2-banker-opt-btns">
              <button className="btn btn-primary" onClick={() => handleBankerOption(true)}>继续当庄</button>
              <button className="btn" onClick={() => handleBankerOption(false)}>转庄</button>
            </div>
          </div>
        )}

        {gameOver && (
          <div className="niu-gameover">
            <div className="niu-gameover-title">
              {players[0].chips <= 0 ? '💸 你破产了！' : '🏆 游戏结束！'}
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
