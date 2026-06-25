import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import {
  dealHands, evaluateHand, settleWithPool, aiDecideBet, findNextBanker,
  HAND_NAMES, MULTIPLIERS, HAND_RANK, INIT_CHIPS, BASE_BET, BANKER_ANTE,
  BANKER_MIN_CHIPS, BANKER_MAX_ROUNDS, POOL_MIN_TO_CONTINUE, isSpecialHand,
} from '../game/niuNiuEngine';
import { getShuffledAIPlayers } from '../ai/personalities';
import { refreshSessionUser } from '../auth/session';
import { playSound } from '../game/sound';
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

const PHASE = {
  IDLE:       'idle',
  BETTING:    'betting',
  REVEAL:     'reveal',
  SETTLE:     'settle',
  BANKER_OPT: 'banker_opt',
};

const PHASE_LABEL = {
  [PHASE.IDLE]:       '下注阶段',
  [PHASE.BETTING]:    '下注阶段',
  [PHASE.REVEAL]:     '翻牌阶段',
  [PHASE.SETTLE]:     '结算阶段',
  [PHASE.BANKER_OPT]: '庄家选择',
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

// 座位组件 — 使用 Card 组件渲染手牌
const NiuSeat = ({ player, hand, revealed, result, chg, bet, isBanker, isWinner, seatIdx }) => {
  const handIcon = result ? HAND_ICONS[result.rank] : null;
  const cls = ['niu2-seat', isBanker && 'banker', player.isHuman && 'human',
    isWinner ? 'winner' : (chg > 0 ? 'win-glow' : chg < 0 ? 'lose-glow' : '')].filter(Boolean).join(' ');
  return (
    <div className={cls} data-seat-idx={seatIdx}>
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

const NiuNiuGame = ({ playerCount, onBack, stealthMode, onToggleStealth, soundEnabled, onToggleSound }) => {
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
  const [winners, setWinners]             = useState(null);
  const [countdown, setCountdown]         = useState(null);
  const [showResult, setShowResult]       = useState(false);
  const [flyingChip, setFlyingChip]       = useState(null);   // 当前飞行的筹码 {from, to, amount, idx}
  const [gameLog, setGameLog]             = useState([]);
  const [logCollapsed, setLogCollapsed]   = useState(true);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [menuPosition, setMenuPosition]   = useState({ top: 0, right: 0 });

  const playersRef  = useRef(players);
  const bankerRef   = useRef(bankerIndex);
  const poolRef     = useRef(pool);
  const roundsRef   = useRef(bankerRounds);
  const anteRef     = useRef(false);
  const countdownRef = useRef(null);
  const buttonRef = useRef(null);
  const settingsRef = useRef(null);

  // 添加游戏日志（限制最多保留 50 条）
  const addLog = useCallback((player, message, color = 'default') => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    setGameLog(prev => [...prev.slice(-49), { time, player, message, color }]);
  }, []);

  const syncRefs = (pls, bi, po, br, ante) => {
    playersRef.current  = pls;
    bankerRef.current   = bi;
    poolRef.current     = po;
    roundsRef.current   = br;
    anteRef.current     = ante;
  };

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
  }, []);

  const startCountdown = useCallback((seconds, onComplete) => {
    clearCountdown();
    let remaining = seconds;
    setCountdown(remaining);
    remaining--;
    countdownRef.current = setInterval(() => {
      if (remaining <= 0) {
        clearCountdown();
        onComplete();
      } else {
        setCountdown(remaining);
        remaining--;
      }
    }, 1000);
  }, [clearCountdown]);

  useEffect(() => () => clearCountdown(), [clearCountdown]);

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

  const isHumanBanker = bankerIndex === 0;

  const triggerSpecialEffect = useCallback((results) => {
    const top = results.filter(r => isSpecialHand(r.rank)).sort((a, b) => b.rank - a.rank)[0];
    if (!top) return;
    setSpecialFlash({ name: top.name, icon: HAND_ICONS[top.rank] || '' });
    playSound('niu_special', !soundEnabled);
    setTimeout(() => setSpecialFlash(null), 2000);
  }, [soundEnabled]);

  // === 庄家轮换 & 流庄逻辑（需在 resolveRound 之前声明） ===

  const doChangeBanker = (pls, oldBankerIdx) => {
    clearCountdown();
    // 庄家带走剩余底池
    const remainingPool = poolRef.current;
    let finalPls = pls;
    if (remainingPool > 0) {
      finalPls = pls.map((p, i) => i === oldBankerIdx ? { ...p, chips: p.chips + remainingPool } : p);
      setPlayers(finalPls);
      addLog(pls[oldBankerIdx].name, `带走底池 ${remainingPool} 筹码`, 'gold');
    }
    const nextIdx = findNextBanker(finalPls, oldBankerIdx);
    if (nextIdx === -1) {
      addLog('系统', '无人可当庄，游戏结束', 'red');
      setGameOver(true);
      return;
    }
    const nextName = finalPls[nextIdx].name;
    addLog('系统', `${nextName} 成为新庄家`, 'green');
    setBankerIndex(nextIdx);
    setBankerRounds(0);
    setPool(0);
    setBankerAnteDeducted(false);
    setPhase(PHASE.IDLE);
    setChanges(null);
    setRevealStep(0);
    setTableMsg('');
    setWinners(null);
    setFlyingChip(null);
    setRound(r => r + 1);
    setNewBankerFlash(nextName);
    playSound('niu_banker', !soundEnabled);
    setTimeout(() => setNewBankerFlash(null), 1400);
    syncRefs(finalPls, nextIdx, 0, 0, false);
    // 仅当人类玩家破产时才结束游戏（AI 破产只是被跳过当庄）
    if (finalPls[0].chips <= 0) setGameOver(true);
  };

  const checkFlow = (pls, bankerIdx, curPool, rounds) => {
    // 流庄检查：底池 < 20
    if (curPool < POOL_MIN_TO_CONTINUE) {
      doChangeBanker(pls, bankerIdx, false);
      return;
    }
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

  const handleNextRoundAuto = (pls, bankerIdx) => {
    const banker = pls[bankerIdx];
    if (banker.chips < BANKER_MIN_CHIPS) {
      doChangeBanker(pls, bankerIdx, false);
      return;
    }
    setWinners(null);
    setPhase(PHASE.IDLE);
    setChanges(null);
    setRevealStep(0);
    setTableMsg('');
    setFlyingChip(null);
    setRound(r => r + 1);
  };

  // pool 在 runRound 时传入（不再每局修改，仅结算时更新）
  const resolveRound = useCallback((results, aiBets, pls, bankerIdx, currentPool) => {
    const chips = pls.map(p => p.chips);
    const { changes: chg, poolRemaining, settlements: steps } = settleWithPool(bankerIdx, results, aiBets, chips, currentPool);

    const newPls = pls.map((p, i) => ({ ...p, chips: Math.max(0, p.chips + chg[i]) }));
    setPlayers(newPls);
    setChanges(chg);
    setPool(poolRemaining);  // 底池持久化，跨局保持

    // 记录结算日志
    pls.forEach((p, i) => {
      const sign = chg[i] >= 0 ? '+' : '';
      addLog(p.name, `${results[i].name} ${sign}${chg[i]}`, chg[i] > 0 ? 'green' : chg[i] < 0 ? 'red' : 'default');
    });

    const newRounds = roundsRef.current + 1;
    syncRefs(newPls, bankerIdx, poolRemaining, newRounds, anteRef.current);
    setBankerRounds(newRounds);

    const summary = pls.map((p, i) => {
      const s = chg[i] >= 0 ? '+' : '';
      return `${p.name} ${results[i].name} ${s}${chg[i]}`;
    }).join(' · ');
    setTableMsg(summary);

    // 播放结算动画：依次展示每个结算步骤（输家先放入，赢家按牌面大→小取）
    const playSettlements = (stepIdx) => {
      if (!steps || stepIdx >= steps.length) {
        // 动画结束，显示结算覆盖层
        const winnerIds = newPls
          .map((p, i) => ({ id: p.id, chg: chg[i] }))
          .filter(w => w.chg > 0)
          .map(w => w.id);
        setWinners(winnerIds);
        setShowResult(true);
        if (chg[0] > 0) playSound('niu_win', !soundEnabled);
        else if (chg[0] < 0) playSound('niu_lose', !soundEnabled);

        setTimeout(() => {
          setShowResult(false);

          // 流庄检查：底池 < 20，庄家带走剩余底池并轮换
          if (poolRemaining < POOL_MIN_TO_CONTINUE) {
            doChangeBanker(newPls, bankerIdx, false);
            return;
          }

          // 满3局检查
          if (newRounds >= BANKER_MAX_ROUNDS && !newPls[bankerIdx].isHuman) {
            checkFlow(newPls, bankerIdx, poolRemaining, newRounds);
          } else if (newRounds >= BANKER_MAX_ROUNDS && newPls[bankerIdx].isHuman) {
            setPhase(PHASE.BANKER_OPT);
          } else {
            setPhase(PHASE.SETTLE);
            startCountdown(5, () => handleNextRoundAuto(newPls, bankerIdx));
          }
        }, 2000);
        return;
      }
      const step = steps[stepIdx];
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
          // 输家：从头像飞向底池
          fromX = `${seatCx}px`; fromY = `${seatCy}px`;
          toX = `${potCx}px`; toY = `${potCy}px`;
        } else {
          // 赢家：从底池飞向头像
          fromX = `${potCx}px`; fromY = `${potCy}px`;
          toX = `${seatCx}px`; toY = `${seatCy}px`;
        }
      }
      setFlyingChip({ ...step, fromX, fromY, toX, toY, stepIdx, total: steps.length });
      playSound('niu_bet', !soundEnabled);
      setTimeout(() => {
        setFlyingChip(null);
        setTimeout(() => playSettlements(stepIdx + 1), 150);
      }, 700);
    };
    playSettlements(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundEnabled, startCountdown]);

  const runRound = useCallback((betMap, pls, bankerIdx, currentPool) => {
    const dealt = dealHands(pls.length);
    const results = dealt.map(h => evaluateHand(h));
    const betsArr = pls.map((p, i) => i === bankerIdx ? 0 : (betMap[p.id] || BASE_BET));

    // 记录下注日志
    pls.forEach((p, i) => {
      if (i !== bankerIdx) {
        addLog(p.name, `下注 ${betsArr[i]}`, 'cyan');
      }
    });

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
      addLog(banker.name, `上任扣底池 ${BANKER_ANTE}`, 'gold');
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
      addLog(banker.name, `上任扣底池 ${BANKER_ANTE}`, 'gold');
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
    clearCountdown();
    const pls = playersRef.current;
    const bi = bankerRef.current;
    const banker = pls[bi];
    if (banker.chips < BANKER_MIN_CHIPS) {
      doChangeBanker(pls, bi, false);
      return;
    }
    setWinners(null);
    setPhase(PHASE.IDLE);
    setChanges(null);
    setRevealStep(0);
    setTableMsg('');
    setFlyingChip(null);
    setRound(r => r + 1);
  };

  const handleBankerOption = (keepBanker) => {
    clearCountdown();
    const pls = playersRef.current;
    const bi = bankerRef.current;
    if (keepBanker) {
      setBankerRounds(0);
      syncRefs(pls, bi, poolRef.current, 0, anteRef.current);
      setPhase(PHASE.IDLE);
      setChanges(null);
      setRevealStep(0);
      setTableMsg('');
      setWinners(null);
      setFlyingChip(null);
      setRound(r => r + 1);
    } else {
      doChangeBanker(pls, bi, false);
    }
  };

  const resetGame = () => {
    clearCountdown();
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
    setWinners(null);
    setShowResult(false);
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

      {/* 结算覆盖层 */}
      {showResult && changes && (
        <>
          {changes[0] > 0 && (
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
                {changes[0] > 0 ? '🏆' : '💸'}
              </div>
              <h2 className={`niu2-result-title ${changes[0] > 0 ? 'win' : 'lose'}`}>
                {changes[0] > 0 ? '你赢了！' : '本局失利'}
              </h2>
              <p className="niu2-result-subtitle">
                {winners && winners.length > 0
                  ? `${players.filter(p => winners.includes(p.id)).map(p => p.name).join('、')} 获胜`
                  : '本局结算'}
              </p>
              <div className={`niu2-result-amount ${changes[0] > 0 ? 'win' : 'lose'}`}>
                {changes[0] > 0 ? '+' : ''}{changes[0]}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="niu2-header">
        <button className="btn btn-icon" onClick={onBack}>←</button>
        <div className="niu2-title">
          <img src="/icons/niu/niu_niu_logo.svg" className="niu-title-logo" alt="斗牛" />
          斗牛
        </div>
        <div className="niu2-header-right">
          <div className="niu2-round">
            第 {round} 局
            {pool > 0 && <span className="niu2-pool-badge">底池 {pool}</span>}
          </div>
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
      {!gameOver && (
        <div className={`niu2-phase-banner ${phase}`}>
          {PHASE_LABEL[phase] || ''}
        </div>
      )}

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
            isWinner={winners?.includes(bankerPlayer.id)}
            seatIdx={bankerIndex}
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
                hand={hands[origIdx] || []}
                revealed={revealStep > origIdx}
                result={handResults[origIdx]}
                chg={changes ? changes[origIdx] : null}
                bet={bets[origIdx] || 0}
                isBanker={false}
                isWinner={winners?.includes(player.id)}
                seatIdx={origIdx}
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
              <div className="niu2-bet-slider-row">
                <input
                  type="range"
                  className="niu2-bet-slider"
                  value={humanBet}
                  min={1}
                  max={humanChips}
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
                <div className="niu2-bet-hint">
                  牛七~牛九 <strong>×2</strong> · 牛牛 <strong>×3</strong> · 特殊牌型 <strong>×5</strong>
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
            {countdown !== null && (
              <div className="niu2-countdown">
                <div className="niu2-countdown-text">
                  <strong>{countdown}</strong> 秒后自动开始下一局
                </div>
                <div className="niu2-countdown-bar">
                  <div className="niu2-countdown-fill" style={{ width: `${(countdown / 5) * 100}%` }} />
                </div>
              </div>
            )}
            <button className="btn btn-primary btn-large" onClick={handleNextRound}>
              立即继续 →
            </button>
          </div>
        )}

        {phase === PHASE.BANKER_OPT && !gameOver && (
          <div className="niu2-banker-opt">
            <div className="niu2-banker-opt-title">已连庄 {bankerRounds} 局</div>
            {tableMsg && <div className="niu2-settle-summary">{tableMsg}</div>}
            <div className="niu2-banker-opt-info">底池当前有 <strong>{pool}</strong> 筹码，转庄可全部带走</div>
            <div className="niu2-banker-opt-btns">
              <button className="btn btn-primary" onClick={() => handleBankerOption(true)}>继续当庄</button>
              <button className="btn" onClick={() => handleBankerOption(false)}>转庄（带走底池）</button>
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

      <GameLog
        logs={gameLog}
        collapsed={logCollapsed}
        onToggle={() => setLogCollapsed(!logCollapsed)}
      />
    </div>
  );
};

export default NiuNiuGame;
