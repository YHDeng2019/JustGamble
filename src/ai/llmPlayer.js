import { localAIDecide } from './localPlayer';
import { debugLog } from '../game/debugLog';

const getStageName = (stage) => {
  const names = {
    'PRE_FLOP': '翻牌前',
    'FLOP': '翻牌',
    'TURN': '转牌',
    'RIVER': '河牌'
  };
  return names[stage] || stage;
};

const getStyleDescription = (style) => {
  const descriptions = {
    conservative: '保守型，只玩强牌，很少虚张声势',
    aggressive: '激进型，频繁加注，喜欢诈唬',
    balanced: '平衡型，按赔率决策，偶尔诈唬',
    random: '随机型，决策带随机性，难以预测',
    mathematical: '数学型，严格按胜率和底池赔率行动'
  };
  return descriptions[style] || descriptions.balanced;
};

export const llmAIDecide = async ({
  hand,
  community,
  toCall,
  pot,
  stack,
  bet,
  style,
  name,
  stage,
  position,
  actionHistory,
  activePlayers,
  totalPlayers,
  playerBets,
  foldedPlayers,
  dealerIndex,
  currentPlayerIndex,
  players,
  settings
}) => {
  // 思考节奏由 Game.jsx 的 thinkTime 统一控制，这里不再额外延迟
  if (!settings.apiKey || !settings.apiBaseUrl) {
    console.log(`[AI] ${name} 使用本地AI (未配置LLM)`);
    const decision = localAIDecide({ hand, community, toCall, pot, stack, bet, style });
    return { ...decision, aiType: 'local' };
  }

  console.log(`[LLM] ${name} 调用LLM决策...`);
  console.log(`[LLM] API配置 - BaseURL: ${settings.apiBaseUrl}, Model: ${settings.aiModel}`);
  try {
    const handCards = hand.map(c => c.id).join(' ');
    const communityCards = community.map(c => c.id).join(' ') || '(未翻牌)';

    // 准备详细的动作历史（按本局行动顺序）
    const historyText = actionHistory.length > 0
      ? actionHistory.join(' → ')
      : '本局尚无动作';

    // 准备所有玩家的详细状态（包括位置信息）
    const playersInfo = players.map((p, idx) => {
      let posLabel = '';
      const relPos = (idx - dealerIndex + players.length) % players.length;
      if (relPos === 0) posLabel = '[D]';
      else if (relPos === 1) posLabel = '[SB]';
      else if (relPos === 2) posLabel = '[BB]';

      const status = p.folded ? '已弃牌' : p.allIn ? 'ALL-IN' : '进行中';
      const isSelf = p.name === name ? '(你)' : '';

      return `${posLabel}${p.name}${isSelf}: ${p.chips}筹码, 已投${p.bet}, ${status}`;
    }).join('\n  ');

    const foldedText = foldedPlayers && foldedPlayers.length > 0
      ? `已弃牌玩家: ${foldedPlayers.map(p => p.name).join(', ')}`
      : '无人弃牌';

    const prompt = `你是德州扑克 AI 玩家，拥有丰富的德州扑克经验和GTO策略知识，只返回 JSON 格式决策，不要 markdown！

你是玩家"${name}"，性格风格：${getStyleDescription(style)}

【牌桌结构】
- 牌桌人数: ${totalPlayers}人局
- 当前轮次: ${getStageName(stage)}
- 剩余活跃玩家: ${activePlayers}人
- ${foldedText}

【你的信息】
- 你的位置: ${position}
- 你的手牌: ${handCards}
- 你的筹码: ${stack}
- 已下注: ${bet}
- 需要跟注: ${toCall} (0=可过牌)

【场上信息】
- 公共牌: ${communityCards}
- 底池总额: ${pot}

【所有玩家状态】
  ${playersInfo}

【本局完整行动历史】
${historyText}

【分析要点】
1. 观察对手的行动模式：谁激进加注？谁保守跟注？谁频繁弃牌？
2. 根据位置和行动推断对手可能的手牌范围
3. 结合你的性格风格做决策
4. 考虑底池赔率和期望值

请根据这些信息做决策！返回格式：
{"action":"fold|check|call|raise","amount":加注总额或0,"reasoning":"简短中文理由"}`;

    // 30秒超时 - 给LLM足够时间
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const fetchStart = Date.now();

    debugLog.llmRequest(name, settings.apiBaseUrl, settings.aiModel, prompt);

    const response = await fetch(`${settings.apiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.aiModel,
        messages: [
          {
            role: 'system',
            content: '你是德州扑克 AI 玩家，拥有丰富的德州扑克经验和GTO策略知识，只返回 JSON！速度优先！'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.65,
        max_tokens: 180
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorDetail = response.status === 403
        ? '403 Forbidden - API Key可能无效或已过期，请检查豆包控制台的API Key权限'
        : `${response.status} ${response.statusText}`;
      throw new Error(`API请求失败: ${errorDetail}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    debugLog.llmResponse(name, response.status, content, Date.now() - fetchStart);

    if (!content) {
      throw new Error('API返回内容为空');
    }

    const cleanedContent = content.replace(/```json|```/g, '').trim();
    const decision = JSON.parse(cleanedContent);

    if (!['fold', 'check', 'call', 'raise'].includes(decision.action)) {
      throw new Error('无效动作类型');
    }

    // 验证加注金额
    if (decision.action === 'raise') {
      const minRaise = bet + toCall + 1;
      if (decision.amount < minRaise) {
        decision.amount = Math.min(minRaise, stack + bet);
      }
      decision.amount = Math.min(decision.amount, stack + bet);
    }

    if (decision.action === 'call') {
      decision.amount = bet + toCall;
    }

    if (decision.action === 'check' || decision.action === 'fold') {
      decision.amount = 0;
    }

    console.log(`[LLM] ${name} 决策成功: ${decision.action} ${decision.amount}`);
    return { ...decision, aiType: 'llm' };
  } catch (error) {
    console.warn(`[LLM] ${name} 决策失败，降级本地:`, error.message);
    debugLog.aiDecisionError(name, error);
    const decision = localAIDecide({ hand, community, toCall, pot, stack, bet, style });
    return { ...decision, aiType: 'local' };
  }
};
