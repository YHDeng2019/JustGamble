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
  IDLE:       'idle',        // 等待操作（下注或发牌）
  BETTING:    'betting',     // 闲家选择下注中（人类为闲家时）
  REVEAL:     'reveal',      // 翻牌动画中
  SETTLE:     'settle',      // 结算展示中
  BANKER_OPT: 'banker_opt',  // 庄家可选转庄
};

// 单张牌
const NiuCard = ({ card, revealed, delay = 0 }) => {
  const isRed = card && ['♥', '♦'].includes(card.suit);
  return (
    <div className={`niu2-card${revealed ? ' revealed' : ' face-down'}`} style={{ animationDelay: `${delay}ms` }}>
      {revealed && card ? (
        <div className={`niu2-card-face${isRed ? ' red' : ''}`}>
          <div className="niu2-card-tl">{card.value}<br/>{card.suit}</div>
          <div className="niu2-card-center">{card.suit}</div>
          <div className="niu2-card-br">{card.value}<br/>{card.suit}</div>
        </div>
      ) : (
        <div className="niu2-card-back"><div className="niu2-card-back-inner" /></div>
      )}
    </div>
  );
};

// 座位
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
          <NiuCard key={card.id} card={card} revealed={revealed} delay={ci * 55} />
        )) : Array.from({ length: 5 }).map((_, ci) => (
          <div key={ci} className="niu2-card face-down placeholder" />
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
  const [bankerRounds, setBankerRounds]   = useState(0);  // 当前庄家连庄局数
  const [pool, setPool]                   = useState(0);   // 当前底池
  const [phase, setPhase]                 = useState(PHASE.IDLE);
  const [hands, setHands]                 = useState([]);
  const [handResults, setHandResults]     = useState([]);
  const [bets, setBets]                   = useState([]);
  const [humanBet, setHumanBet]           = useState(BASE_BET);
  const [changes, setChanges]             = useState(null);
  const [round, setRound]                 = useState(1);
  const [revealStep, setRevealStep]       = useState(0);
  const [tableMsg, setTableMsg]           = useState('');
  const [gameOver, setGameOver]           = useState(false);
  const [specialFlash, setSpecialFlash]   = useState(null);
  const [newBankerFlash, setNewBankerFlash] = useState(null); // name string

  // refs to avoid stale closures in setTimeout chains
  const playersRef  = useRef(players);
  const bankerRef   = useRef(bankerIndex);
  const poolRef     = useRef(pool);
  const roundsRef   = useRef(bankerRounds);

  const syncRefs = (pls, bi, po, br) => {
    playersRef.current  = pls;
    bankerRef.current   = bi;
    poolRef.current     = po;
    roundsRef.current   = br;
  };

  const isHumanBanker = bankerIndex === 0;

  const triggerSpecialEffect = useCallback((results) => {
    const top = results.filter(r => isSpecialHand(r.rank)).sort((a, b) => b.rank - a.rank)[0];
    if (!top) return;
    setSpecialFlash({ name: top.name, icon: HAND_ICONS[top.rank] || '' });
    playSound('niu_special', !soundEnabled);
    setTimeout(() => setSpecialFlash(null), 2000);
  }, [soundEnabled]);

  // 执行发牌+翻牌+结算流程
  const runRound = useCallback((betMap, pls, bankerIdx, curPool) => {
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
        const afterReveal = () => {
          const chips = pls.map(p => p.chips);
          // 庄家已在 IDLE→REVEAL 过渡时扣了 BANKER_ANTE，这里 pool 已含庄家的入池
          const { changes: chg, settlements } = settleWithPool(bankerIdx, results, betsArr, chips);

          // 应用变化
          const newPls = pls.map((p, i) => ({ ...p, chips: Math.max(0, p.chips + chg[i]) }));
          setPlayers(newPls);
          setChanges(chg);
          setPool(0); // 底池已分完（剩余已计入庄家 chg）

          const newPool = 0;
          const newRounds = roundsRef.current + 1;
          syncRefs(newPls, bankerIdx, newPool, newRounds);
          setBankerRounds(newRounds);

          const summary = pls.map((p, i) => {
            const s = chg[i] >= 0 ? '+' : '';
            return `${p.name} ${results[i].name} ${s}${chg[i]}`;
          }).join(' · ');
          setTableMsg(summary);

          if (chg[0] > 0) playSound('niu_win', !soundEnabled);
          else if (chg[0] < 0) playSound('niu_lose', !soundEnabled);

          // 判断庄家是否可选转庄
          if (newRounds >= BANKER_MAX_ROUNDS && !newPls[bankerIdx].isHuman) {
            // AI 庄家：直接检查流庄
            checkFlow(newPls, bankerIdx, newPool, newRounds, chg);
          } else {
            setPhase(PHASE.SETTLE);
          }
        };

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
  }, [soundEnabled, triggerSpecialEffect]);

  // 检查流庄/转庄
  const checkFlow = (pls, bankerIdx, curPool, rounds, chg) => {
    const banker = pls[bankerIdx];
    // 流庄条件：底池已被拿光（curPool 已为0，但检查庄家本局收益极少）
    // 实际流庄触发：庄家筹码 < BANKER_MIN_CHIPS（下一局无法做庄）
    const canContinue = banker.chips >= BANKER_MIN_CHIPS;
    if (!canContinue) {
      // 强制流庄
      doChangeBanker(pls, bankerIdx, 0, false);
      return;
    }
    if (rounds >= BANKER_MAX_ROUNDS && banker.isHuman) {
      setPhase(PHASE.BANKER_OPT);
      return;
    }
    // AI 庄家：满3局自动转庄
    if (rounds >= BANKER_MAX_ROUNDS) {
      doChangeBanker(pls, bankerIdx, 0, false);
      return;
    }
    setPhase(PHASE.SETTLE);
  };

  const doChangeBanker = (pls, oldBankerIdx, remainingPool, keepPool) => {
    let newPls = pls;
    // 庄家选择带走底池（keepPool=true）
    if (keepPool && remainingPool > 0) {
      newPls = pls.map((p, i) => i === oldBankerIdx ? { ...p, chips: p.chips + remainingPool } : p);
      setPlayers(newPls);
    }
    const nextIdx = findNextBanker(newPls, oldBankerIdx);
    if (nextIdx === -1) {
      setGameOver(true);
      return;
    }
    const nextName = newPls[nextIdx].name;
    setBankerIndex(nextIdx);
    setBankerRounds(0);
    setPool(0);
    setPhase(PHASE.IDLE);
    setChanges(null);
    setRevealStep(0);
    setTableMsg('');
    setRound(r => r + 1);
    setNewBankerFlash(nextName);
    playSound('niu_banker', !soundEnabled);
    setTimeout(() => setNewBankerFlash(null), 1400);
    syncRefs(newPls, nextIdx, 0, 0);

    if (newPls.some(p => p.chips <= 0)) setGameOver(true);
  };

  // 庄家发牌（扣庄家入池）
  const handleDeal = () => {
    if (phase !== PHASE.IDLE) return;
    const pls = playersRef.current;
    const bi = bankerRef.current;
    const banker = pls[bi];
    if (banker.chips < BANKER_ANTE) {
      doChangeBanker(pls, bi, 0, false);
      return;
    }
    // 扣庄家筹码入池
    const newPls = pls.map((p, i) => i === bi ? { ...p, chips: p.chips - BANKER_ANTE } : p);
    setPlayers(newPls);
    setPool(BANKER_ANTE);
    playSound('niu_bet', !soundEnabled);

    // 构建 AI 下注
    const betMap = {};
    newPls.forEach((p, i) => {
      if (i !== bi && !p.isHuman) {
        betMap[p.id] = aiDecideBet(BASE_BET, p.chips);
      }
    });
    setBets(newPls.map((p, i) => i === bi ? 0 : (betMap[p.id] || BASE_BET)));
    syncRefs(newPls, bi, BANKER_ANTE, roundsRef.current);
    runRound(betMap, newPls, bi, BANKER_ANTE);
  };

  // 闲家确认下注
  const handleHumanBet = (bet) => {
    const pls = playersRef.current;
    const bi = bankerRef.current;
    const banker = pls[bi];
    if (banker.chips < BANKER_ANTE) {
      doChangeBanker(pls, bi, 0, false);
      return;
    }
    const newPls = pls.map((p, i) => i === bi ? { ...p, chips: p.chips - BANKER_ANTE } : p);
    setPlayers(newPls);
    setPool(BANKER_ANTE);
    setHumanBet(bet);
    playSound('niu_bet', !soundEnabled);

    const betMap = { human: bet };
    newPls.forEach((p, i) => {
      if (i !== bi && !p.isHuman) {
        betMap[p.id] = aiDecideBet(BASE_BET, p.chips);
      }
    });
    syncRefs(newPls, bi, BANKER_ANTE, roundsRef.current);
    runRound(betMap, newPls, bi, BANKER_ANTE);
  };

  // 继续下一局（庄家不变）
  const handleNextRound = () => {
    const pls = playersRef.current;
    const bi = bankerRef.current;
    const banker = pls[bi];
    // 检查流庄
    if (banker.chips < BANKER_MIN_CHIPS) {
      doChangeBanker(pls, bi, 0, false);
      return;
    }
    setPhase(PHASE.IDLE);
    setChanges(null);
    setRevealStep(0);
    setTableMsg('');
    setRound(r => r + 1);
  };

  // 庄家选择继续/转庄
  const handleBankerOption = (keepBanker) => {
    const pls = playersRef.current;
    const bi = bankerRef.current;
    if (keepBanker) {
      setBankerRounds(0);
      syncRefs(pls, bi, 0, 0);
      setPhase(PHASE.IDLE);
      setChanges(null);
      setRevealStep(0);
      setTableMsg('');
      setRound(r => r + 1);
    } else {
      doChangeBanker(pls, bi, 0, true); // keepPool=true：带走底池（本例底池已为0，结算后无剩余）
    }
  };

  const resetGame = () => {
    const newPls = buildPlayers(playerCount, user);
    setPlayers(newPls);
    setBankerIndex(0);
    setBankerRounds(0);
    setPool(0);
    setPhase(PHASE.IDLE);
    setRound(1);
    setChanges(null);
    setTableMsg('');
    setGameOver(false);
    setHumanBet(BASE_BET);
    setSpecialFlash(null);
    setRevealStep(0);
    syncRefs(newPls, 0, 0, 0);
  };

  const bankerPlayer   = players[bankerIndex];
  const idlePlayers    = players.filter((_, i) => i !== bankerIndex);
  const bankerHand     = hands[bankerIndex] || [];
  const bankerResult   = handResults[bankerIndex];
  const bankerChg      = changes ? changes[bankerIndex] : null;

  // 确定闲家需要的下注选项（不能超过自身筹码）
  const humanChips = players[0]?.chips || 0;
  const betOptions = [100, 200, 500].filter(v => v <= humanChips);
  if (betOptions.length === 0) betOptions.push(Math.min(100, humanChips));

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
          <div className="niu2-felt-pool">
            {pool > 0 ? `💰 底池 ${pool}` : tableMsg || (phase === PHASE.IDLE ? '等待发牌' : '')}
          </div>
          {bankerRounds > 0 && (
            <div className="niu2-felt-rounds">庄家已连庄 {bankerRounds} 局</div>
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
                你是庄家，本局需放入 <strong>{BANKER_ANTE}</strong> 筹码进底池
              </div>
              <button className="btn btn-primary btn-large" onClick={handleDeal}>
                🐂 发牌开局
              </button>
            </div>
          ) : (
            <div className="niu-bet-controls">
              <div className="niu-bet-title">选择下注金额</div>
              <div className="niu-bet-options">
                {betOptions.map(v => (
                  <button
                    key={v}
                    className={`niu-bet-btn${humanBet === v ? ' selected' : ''}`}
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
            <div className="niu2-banker-opt-title">你已连庄 {bankerRounds} 局</div>
            {tableMsg && <div className="niu2-settle-summary">{tableMsg}</div>}
            <div className="niu2-banker-opt-btns">
              <button className="btn btn-primary" onClick={() => handleBankerOption(true)}>
                继续当庄
              </button>
              <button className="btn" onClick={() => handleBankerOption(false)}>
                转庄
              </button>
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
