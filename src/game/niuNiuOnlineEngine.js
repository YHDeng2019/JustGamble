/**
 * 斗牛联机引擎（Firebase 同步）
 *
 * 架构：轻量级，无需复杂的 OnlineGameEngine 封装。
 * 房主（host）执行全部游戏逻辑，把 gameState 写到 Firebase；
 * 非房主订阅 gameState 并推送 action（bet/pass）。
 *
 * Firebase 节点：
 *   rooms/{roomId}/niuState     — 完整游戏状态（仅 host 写入）
 *   rooms/{roomId}/niuActions   — 玩家动作队列（childAdded 监听）
 */

import { ref, set, push, onValue, onChildAdded, off, get } from 'firebase/database';
import { getFirebaseDB } from '../services/firebase';
import {
  dealHands, evaluateHand, settleWithPool, aiDecideBet, findNextBanker,
  HAND_RANK, INIT_CHIPS, BASE_BET, BANKER_ANTE, BANKER_MIN_CHIPS, BANKER_MAX_ROUNDS,
} from '../game/niuNiuEngine';

export class NiuNiuOnlineEngine {
  constructor(roomId, userId, isHost) {
    this.roomId  = roomId;
    this.userId  = userId;
    this.isHost  = isHost;
    this._stateCallbacks = [];
    this._unsubState  = null;
    this._unsubActions = null;
    this._pendingBets  = {};  // host 收集的下注 { userId: amount }
    this._state = null;
  }

  // ── 订阅游戏状态 ──────────────────────────────────────────────
  subscribeState(cb) {
    this._stateCallbacks.push(cb);
    const db  = getFirebaseDB();
    const ref_ = ref(db, `rooms/${this.roomId}/niuState`);
    const listener = onValue(ref_, snap => {
      const s = snap.val();
      if (!s) return;
      this._state = s;
      this._stateCallbacks.forEach(fn => fn(s));
    });
    this._unsubState = () => off(ref_, 'value', listener);
    return this._unsubState;
  }

  // ── 订阅动作队列（host 专用） ─────────────────────────────────
  subscribeActions() {
    if (!this.isHost) return;
    const db   = getFirebaseDB();
    const ref_ = ref(db, `rooms/${this.roomId}/niuActions`);
    const listener = onChildAdded(ref_, snap => {
      const action = snap.val();
      if (!action) return;
      this._handleAction(action);
    });
    this._unsubActions = () => off(ref_, 'child_added', listener);
  }

  destroy() {
    if (this._unsubState)   this._unsubState();
    if (this._unsubActions) this._unsubActions();
  }

  // ── 非 host 玩家推送动作 ──────────────────────────────────────
  async pushAction(action) {
    if (this.isHost) {
      this._handleAction({ ...action, userId: this.userId });
      return;
    }
    const db = getFirebaseDB();
    await push(ref(db, `rooms/${this.roomId}/niuActions`), {
      ...action,
      userId: this.userId,
      ts: Date.now(),
    });
  }

  // ── Host 初始化游戏 ───────────────────────────────────────────
  async initGame(roomData) {
    if (!this.isHost) return;
    const players = Object.values(roomData.players)
      .filter(p => p.isOnline !== false)
      .map(p => ({
        id: p.userId,
        name: p.displayName,
        avatar: p.avatar,
        chips: INIT_CHIPS,
        isHuman: !p.isBot,
        isBot: !!p.isBot,
        style: p.style || 'balanced',
      }));

    const state = {
      players,
      bankerIndex: 0,
      bankerRounds: 0,
      pool: 0,
      round: 1,
      phase: 'idle',       // idle | betting | reveal | settle | banker_opt | gameover
      hands: null,
      handResults: null,
      bets: null,
      changes: null,
      tableMsg: '',
      revealOrder: [],     // 翻牌顺序（每个玩家索引依次 reveal）
      revealedCount: 0,
      startedAt: Date.now(),
    };
    this._state = state;
    await this._write(state);
  }

  // ── Host 开始新一局（庄家已确定） ─────────────────────────────
  async startRound(betMap) {
    if (!this.isHost) return;
    const s = this._state;
    const pls = s.players;
    const bi  = s.bankerIndex;

    // 扣庄家入池
    const newPls = pls.map((p, i) =>
      i === bi ? { ...p, chips: p.chips - BANKER_ANTE } : p
    );
    const hands = dealHands(pls.length);
    const results = hands.map(h => evaluateHand(h));
    const bets = pls.map((p, i) => {
      if (i === bi) return 0;
      return betMap[p.id] || BASE_BET;
    });

    // 构建翻牌顺序（所有玩家索引列表，逐步 reveal）
    const revealOrder = pls.map((_, i) => i);

    const newState = {
      ...s,
      players: newPls,
      pool: BANKER_ANTE,
      phase: 'reveal',
      hands: hands.map(h => h.map(c => ({ ...c }))),
      handResults: results,
      bets,
      changes: null,
      tableMsg: '翻牌中…',
      revealOrder,
      revealedCount: 0,
      changes: null,
    };
    this._state = newState;
    await this._write(newState);

    // 逐步翻牌（host 定时推进）
    this._runReveal(newState, results, bets, newPls, bi);
  }

  _runReveal(state, results, bets, pls, bi) {
    let revealed = 0;
    const total  = pls.length;
    const timer  = setInterval(async () => {
      revealed++;
      const ns = { ...this._state, revealedCount: revealed };
      this._state = ns;
      await this._write(ns);

      if (revealed >= total) {
        clearInterval(timer);
        setTimeout(() => this._doSettle(results, bets, pls, bi), 700);
      }
    }, 500);
  }

  async _doSettle(results, bets, pls, bi) {
    const chips = pls.map(p => p.chips);
    const { changes } = settleWithPool(bi, results, bets, chips);

    const newPls = pls.map((p, i) => ({ ...p, chips: Math.max(0, p.chips + changes[i]) }));
    const summary = pls.map((p, i) => {
      const s = changes[i] >= 0 ? '+' : '';
      return `${p.name} ${results[i].name} ${s}${changes[i]}`;
    }).join(' · ');

    const newRounds = (this._state.bankerRounds || 0) + 1;
    const banker = newPls[bi];
    let phase = 'settle';
    if (newRounds >= BANKER_MAX_ROUNDS && !banker.isBot) phase = 'banker_opt';
    else if (newRounds >= BANKER_MAX_ROUNDS) phase = 'auto_change_banker';

    const ns = {
      ...this._state,
      players: newPls,
      pool: 0,
      changes,
      tableMsg: summary,
      bankerRounds: newRounds,
      phase,
    };
    this._state = ns;
    await this._write(ns);

    // AI 庄：自动处理
    if (phase === 'auto_change_banker') {
      setTimeout(() => this._changeBanker(newPls, bi), 1200);
    }
  }

  async _changeBanker(pls, oldBi) {
    const nextBi = findNextBanker(pls, oldBi);
    if (nextBi === -1) {
      const ns = { ...this._state, phase: 'gameover' };
      this._state = ns;
      await this._write(ns);
      return;
    }
    const ns = {
      ...this._state,
      players: pls,
      bankerIndex: nextBi,
      bankerRounds: 0,
      pool: 0,
      phase: 'idle',
      hands: null,
      handResults: null,
      bets: null,
      changes: null,
      tableMsg: '',
      revealOrder: [],
      revealedCount: 0,
      round: (this._state.round || 1) + 1,
    };
    this._state = ns;
    await this._write(ns);
  }

  // ── Host 处理玩家动作 ─────────────────────────────────────────
  _handleAction(action) {
    if (!this.isHost) return;
    if (action.type === 'bet') {
      this._pendingBets[action.userId] = action.amount;
      this._checkAllBetsReady();
    } else if (action.type === 'banker_deal') {
      // 庄家（host 自己）确认发牌
      this._pendingBets = {};
      const s = this._state;
      const pls = s.players;
      const bi  = s.bankerIndex;
      // AI 闲家自动下注
      pls.forEach((p, i) => {
        if (i !== bi && p.isBot) {
          this._pendingBets[p.id] = aiDecideBet(BASE_BET, p.chips);
        }
      });
      // 如果庄家是真人 host，等待其他真人下注
      this._checkAllBetsReady();
    } else if (action.type === 'banker_opt') {
      const s = this._state;
      const pls = s.players;
      const bi  = s.bankerIndex;
      if (action.keep) {
        const ns = {
          ...s,
          bankerRounds: 0,
          phase: 'idle',
          hands: null,
          handResults: null,
          bets: null,
          changes: null,
          tableMsg: '',
          round: s.round + 1,
          revealOrder: [],
          revealedCount: 0,
        };
        this._pendingBets = {};
        this._state = ns;
        this._write(ns);
      } else {
        this._changeBanker(pls, bi);
      }
    } else if (action.type === 'next_round') {
      const s = this._state;
      const ns = {
        ...s,
        phase: 'idle',
        hands: null,
        handResults: null,
        bets: null,
        changes: null,
        tableMsg: '',
        round: s.round + 1,
        revealOrder: [],
        revealedCount: 0,
      };
      this._pendingBets = {};
      this._state = ns;
      this._write(ns);
    }
  }

  _checkAllBetsReady() {
    const s   = this._state;
    if (!s) return;
    const pls = s.players;
    const bi  = s.bankerIndex;
    // 所有非庄非机器人真人玩家都要有下注
    const humanIdlers = pls.filter((p, i) => i !== bi && !p.isBot && p.isOnline !== false);
    const allReady = humanIdlers.every(p => p.id in this._pendingBets);
    if (allReady) {
      this.startRound({ ...this._pendingBets });
      this._pendingBets = {};
    }
  }

  async _write(state) {
    const db = getFirebaseDB();
    await set(ref(db, `rooms/${this.roomId}/niuState`), state);
  }
}
