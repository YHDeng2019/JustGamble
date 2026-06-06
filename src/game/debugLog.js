/**
 * Debug Logger - 记录最近几局的详细游戏日志
 * 用于排查 bug，记录中间状态、AI 请求/响应、引擎决策等
 * 数据存储在 localStorage key: "poker_debug_log"
 * 保留最近3局的日志，方便回溯查看
 */

const LOG_KEY = 'poker_debug_log';
const MAX_SESSIONS = 3; // 保留最近3局

class DebugLogger {
  constructor() {
    this.sessions = []; // 每局是一个session
    this.currentSession = null;
    this.loadFromStorage();
  }

  // 从 localStorage 加载历史日志
  loadFromStorage() {
    try {
      const raw = localStorage.getItem(LOG_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        this.sessions = Array.isArray(data.sessions) ? data.sessions : [];
      }
    } catch {
      this.sessions = [];
    }
  }

  // 开始新一局，保留旧日志
  startSession(meta = {}) {
    // 结束当前session（如果有）
    if (this.currentSession) {
      this.sessions.push(this.currentSession);
    }

    // 只保留最近 MAX_SESSIONS 局
    if (this.sessions.length > MAX_SESSIONS) {
      this.sessions = this.sessions.slice(-MAX_SESSIONS);
    }

    // 开始新session
    this.currentSession = {
      sessionStart: Date.now(),
      entries: [],
      meta: {
        timestamp: new Date().toISOString(),
        ...meta
      }
    };

    this.add('SESSION_START', this.currentSession.meta);
  }

  // 添加一条日志到当前session
  add(type, data) {
    if (!this.currentSession) {
      this.startSession();
    }

    const entry = {
      type,
      time: Date.now(),
      elapsed: Date.now() - this.currentSession.sessionStart,
      data
    };
    this.currentSession.entries.push(entry);
    this._persist();
  }

  // 记录引擎状态快照
  engineState(stage, gameState) {
    this.add('ENGINE_STATE', {
      stage,
      pot: gameState.pot,
      currentPlayerIndex: gameState.currentPlayerIndex,
      dealerIndex: gameState.dealerIndex,
      players: gameState.players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        bet: p.bet,
        folded: p.folded,
        allIn: p.allIn,
        hasActed: p.hasActed,
        hand: p.hand?.map(c => c.id) || []
      })),
      communityCards: gameState.communityCards.map(c => c.id)
    });
  }

  // 记录玩家行动
  playerAction(playerName, action, amount, context = {}) {
    this.add('PLAYER_ACTION', {
      player: playerName,
      action,
      amount,
      ...context
    });
  }

  // 记录 AI 决策过程
  aiDecisionStart(playerName, input) {
    this.add('AI_DECISION_START', {
      player: playerName,
      hand: input.hand?.map(c => c.id),
      community: input.community?.map(c => c.id),
      toCall: input.toCall,
      pot: input.pot,
      stack: input.stack,
      bet: input.bet,
      style: input.style,
      stage: input.stage
    });
  }

  aiDecisionResult(playerName, decision, aiType, durationMs) {
    this.add('AI_DECISION_RESULT', {
      player: playerName,
      decision: {
        action: decision.action,
        amount: decision.amount,
        reasoning: decision.reasoning
      },
      aiType,
      durationMs
    });
  }

  aiDecisionError(playerName, error) {
    this.add('AI_DECISION_ERROR', {
      player: playerName,
      error: error?.message || String(error)
    });
  }

  // 记录 LLM API 请求/响应
  llmRequest(playerName, url, model, prompt) {
    this.add('LLM_REQUEST', {
      player: playerName,
      url,
      model,
      promptLength: prompt.length
    });
  }

  llmResponse(playerName, status, content, durationMs) {
    this.add('LLM_RESPONSE', {
      player: playerName,
      status,
      content: content?.substring(0, 500),
      durationMs
    });
  }

  // 记录阶段切换
  stageChange(from, to) {
    this.add('STAGE_CHANGE', { from, to });
  }

  // 记录下注轮完成判定
  bettingRoundCheck(result, details) {
    this.add('BETTING_ROUND_CHECK', { complete: result, ...details });
  }

  // 记录 showdown 结果
  showdownResult(winners, playerHands, communityCards, activePlayers) {
    this.add('SHOWDOWN', {
      communityCards: communityCards ? communityCards.map(c => `${c.value}${c.suit}`) : [],
      winners,
      hands: Object.fromEntries(
        Object.entries(playerHands).map(([id, hand]) => {
          const player = activePlayers.find(p => p.id === id);
          return [id, {
            playerName: player?.name || id,
            holeCards: player?.hand ? player.hand.map(c => `${c.value}${c.suit}`) : [],
            rank: hand.rank,
            name: hand.name,
            bestFive: hand.cards ? hand.cards.map(c => `${c.value}${c.suit}`) : []
          }];
        })
      )
    });
  }

  // 记录 endHand（所有人 fold）
  endHandResult(winnerId, potAmount) {
    this.add('END_HAND', { winnerId, potAmount });
  }

  // 记录 finishGame
  finishGameResult(record) {
    this.add('FINISH_GAME', record);
  }

  // 记录错误
  error(context, err) {
    this.add('ERROR', {
      context,
      message: err?.message || String(err),
      stack: err?.stack?.substring(0, 300)
    });
  }

  // 持久化到 localStorage
  _persist() {
    try {
      const allSessions = [...this.sessions];
      if (this.currentSession) {
        allSessions.push(this.currentSession);
      }
      localStorage.setItem(LOG_KEY, JSON.stringify({ sessions: allSessions }));
    } catch (e) {
      // localStorage 满了就只保留最近1局
      if (this.currentSession) {
        try {
          localStorage.setItem(LOG_KEY, JSON.stringify({ sessions: [this.currentSession] }));
        } catch (_) { /* ignore */ }
      }
    }
  }

  // 获取所有日志（用于控制台查看）
  getLog() {
    const allSessions = [...this.sessions];
    if (this.currentSession) {
      allSessions.push(this.currentSession);
    }
    return allSessions;
  }

  // 从 localStorage 恢复（页面刷新后可查看上次日志）
  static load() {
    try {
      const raw = localStorage.getItem(LOG_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data.sessions) ? data.sessions : [];
    } catch {
      return [];
    }
  }

  // 格式化输出（方便复制给开发者）
  static dump() {
    const sessions = DebugLogger.load();
    if (sessions.length === 0) return 'No debug logs found';

    return sessions.map((session, idx) => {
      const round = session.meta?.round || '?';
      const timestamp = session.meta?.timestamp || '';
      const lines = session.entries.map(e =>
        `[${e.elapsed}ms] ${e.type}: ${JSON.stringify(e.data)}`
      );
      return `\n========== 第 ${round} 局 (${timestamp}) ==========\n${lines.join('\n')}`;
    }).join('\n\n');
  }
}

// 全局单例
export const debugLog = new DebugLogger();

// 挂到 window 上方便控制台调试
if (typeof window !== 'undefined') {
  window.__pokerDebug = {
    log: () => debugLog.getLog(),
    dump: () => DebugLogger.dump(),
    print: () => console.log(DebugLogger.dump())
  };
}

export default DebugLogger;
