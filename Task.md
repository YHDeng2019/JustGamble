# 项目：Texas Hold'em 德州扑克游戏JustGamble
# 风格：Balatro × 本地多用户账号 × AI 对战

## 项目概述

请帮我从零开始构建一个完整的德州扑克（Texas Hold'em）网页游戏，游戏名称叫做JustGamble，中文名叫“杰斯刚宝”。
- 视觉风格参考独立游戏《Balatro》：深色赌场氛围、复古扑克牌美学、霓虹色调点缀、动感卡牌动画
- 玩家在 4~6 人桌与 AI 对手对战，AI 决策通过外部 LLM API 驱动
- 支持本地多用户账号系统，每个用户有独立配置、API Key 和历史战绩
- 纯前端单页应用，所有数据存储在 localStorage，零后端依赖

---

## 技术栈

- 框架：React（Vite 脚手架）或 纯 HTML + CSS + JS（均可，推荐 React 方便组件化）
- 样式：CSS Modules 或 原生 CSS
- 数据持久化：localStorage（无后端）
- AI 对战：调用外部 LLM API（OpenAI 兼容格式），每个用户独立配置
- 构建：Vite（npm run dev 本地运行，npm run build 打包）

---

## 一、本地账号系统

### 1.1 数据结构（localStorage）

所有数据存在两个 key 下：

```js
// key: "poker_users"  —— 所有用户数据
{
  "user_<uuid>": {
    "userId": "user_<uuid>",
    "displayName": "Evan",
    "avatar": "🎯",           // 从预设 emoji 列表中选
    "pin": "1234",            // 可选，4 位数字 PIN，空字符串表示无密码
    "createdAt": "ISO时间戳",
    "settings": {
      "apiBaseUrl": "https://api.openai.com/v1",
      "apiKey": "",           // 明文存储，README 中注明安全提示
      "aiModel": "gpt-4o-mini",
      "defaultPlayers": 4,    // 4 / 5 / 6
      "initialChips": 1000,
      "bigBlind": 20,
      "smallBlind": 10
    },
    "stats": {
      "totalGames": 0,
      "wins": 0,
      "losses": 0,
      "totalProfit": 0,       // 累计盈亏筹码
      "biggestWin": 0,        // 单局最大盈利
      "bestHand": ""          // 历史最好牌型
    },
    "history": []             // 最多保留 50 局，见下方结构
  }
}

// key: "poker_current_user"  —— 当前登录的 userId，字符串
"user_<uuid>"
```

### 1.2 单局历史记录结构

```js
{
  "id": "uuid",
  "playedAt": "ISO时间戳",
  "result": "win" | "lose" | "draw",
  "playersCount": 4,
  "initialChips": 1000,
  "finalChips": 1340,
  "profit": 340,              // finalChips - initialChips
  "roundsPlayed": 8,          // 打了几手
  "bestHand": "同花顺",       // 本局出现过的最好牌型
  "durationSeconds": 420
}
```

history 数组超过 50 条时，自动删除最旧的一条。

### 1.3 账号相关页面

#### 用户选择页（启动页）
- 游戏启动时首先显示此页，Balatro 风格背景
- 展示已创建的用户卡片（头像 emoji + 昵称 + 总场次/胜率）
- 右下角「+ 新建用户」按钮
- 点击用户卡片：
  - 无 PIN → 直接进入主菜单
  - 有 PIN → 弹出 4 位数字输入框，验证通过后进入
- 用户卡片上有「删除」小图标（确认后删除该用户所有数据）
- 首次使用（无任何用户）时，直接跳转新建用户流程

#### 新建用户流程
- 步骤一：输入昵称（2~12 字符）
- 步骤二：选择头像（预设 12 个 emoji：🎯 🎲 🃏 🦊 🎩 🌸 🧊 🎭 🦁 🐉 🌊 ⚡）
- 步骤三：设置 PIN（可跳过）
- 完成后自动登录并进入主菜单

#### 设置页
- 当前用户信息：头像 + 昵称（可修改）+ 更换头像
- 修改 PIN（需先验证旧 PIN）
- AI API 配置：
  - API Base URL（输入框，placeholder: https://api.openai.com/v1）
  - API Key（password 类型输入框，眼睛图标切换显示）
  - 模型名称（输入框，placeholder: gpt-4o-mini）
  - 「测试连接」按钮（发一条简单请求验证 key 是否有效）
- 游戏默认设置：默认桌面人数、初始筹码、盲注金额
- 危险区域：「删除本账号」（确认后清除数据并返回用户选择页）
- 底部：「退出登录」（返回用户选择页，不删数据）

#### 历史对局页
- 标签页切换：「对局记录」/「统计」
- 对局记录 Tab：
  - 按时间倒序列出最近 50 局
  - 每条记录显示：日期时间、胜负（彩色标签）、盈亏（+/- 筹码，绿/红色）、桌面人数、最佳手牌、对局时长
  - 空状态：「还没有对局记录，去开始第一局吧」
- 统计 Tab：
  - 核心指标卡片：总场次 / 胜率 / 总盈亏 / 最大单局盈利 / 历史最好牌型
  - 最近 20 局盈亏折线图（用 Canvas 或 SVG 简单实现）

---

## 二、视觉风格（Balatro 参考）

### 色彩系统
```css
--bg-deep:       #0a1628;   /* 最深背景 */
--bg-table:      #0d2818;   /* 赌桌桌布 */
--bg-card:       #111e30;   /* 卡片/面板背景 */
--bg-surface:    #1a2d40;   /* 次级面板 */
--neon-gold:     #f5c842;   /* 霓虹金，主强调色 */
--neon-red:      #ff4d6d;   /* 霓虹红 */
--neon-purple:   #c77dff;   /* 霓虹紫 */
--neon-green:    #39ff88;   /* 霓虹绿，胜利/正向 */
--text-primary:  #f0e6d3;   /* 主文字，米白 */
--text-muted:    #7a8fa6;   /* 次要文字 */
--border-dim:    #1e3a52;   /* 默认描边 */
--border-glow:   #f5c842aa; /* 高亮描边 */
```

### 字体
```html
<!-- 引入 Google Fonts -->
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Inter:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```
- 大标题/金额数字：Cinzel，金色
- 界面文字：Inter
- 代码/日志：JetBrains Mono

### 按钮样式
- 默认：深色背景 + 细描边，文字米白
- Hover：描边变霓虹金色 + 轻微 box-shadow glow
- Active：scale(0.97)
- 主操作按钮（Call / Raise）：霓虹金描边 + 淡金色背景

### 卡牌设计
- 正面：米白底 (#f5f0e8)，黑色花色用 #1a1a1a，红色花色用 #d63031
- 背面：深蓝底 (#0d1f35)，带菱形几何纹理（CSS repeating-linear-gradient 实现）
- 尺寸：手牌区 80×112px，公共牌区 68×95px，其他玩家 44×62px（可缩放）
- 翻牌动画：CSS 3D rotateY(180deg)，0.4s ease
- 发牌动画：从庄家位置飞入 + translate + opacity 0→1，stagger 每张间隔 80ms
- hover 手牌：translateY(-8px) + 金色 box-shadow

### 赌桌布局
- 椭圆形赌桌（CSS border-radius: 50%），深绿色桌布，金色细描边
- 桌面中央：公共牌区（横排 5 张）+ 底池显示（Cinzel 大字金色）
- 玩家座位：围绕椭圆分布，6 个固定位置（bottom-center 是人类玩家）
- 每个玩家座位显示：头像 emoji + 昵称 + 筹码数 + 当前下注额 + 状态标签（活跃/弃牌/全押）
- 庄家按钮（D）：白色圆形小标，跟随当前庄家座位

### 操作区（仅人类玩家回合显示）
- 固定在屏幕底部，人类玩家手牌上方
- 按钮组：Fold / Check（或 Call X） / Raise
- Raise 时显示滑动条（min: 最小加注，max: 全押），实时显示加注额
- 倒计时进度条（可选，30 秒自动过牌/弃牌）

---

## 三、游戏核心逻辑

### 3.1 完整德州扑克流程

每一局按以下状态机流转：
WAITING → DEALING → PRE_FLOP → FLOP → TURN → RIVER → SHOWDOWN → RESULT → WAITING

1. DEALING：发底牌（每人 2 张），动画逐张发出
2. PRE_FLOP：从大盲左边开始下注轮
3. FLOP：翻 3 张公牌（动画揭示），下注轮
4. TURN：翻 1 张公牌，下注轮
5. RIVER：翻 1 张公牌，最终下注轮
6. SHOWDOWN：未弃牌玩家亮牌，计算最优 5 张，判断赢家
7. RESULT：展示结果，分配底池，3 秒后开始下一局

### 3.2 下注规则
- 支持操作：Fold / Check / Call / Bet / Raise / All-in
- 最小加注 = max(大盲, 上一次加注额)
- 每轮下注结束条件：所有未弃牌玩家下注额相等（或 all-in）
- 边池处理：当有玩家 all-in 时，正确计算主池和边池，各池独立结算

### 3.3 手牌评估（7 选 5）
实现完整算法，从 7 张牌（2 手牌 + 5 公牌）中选最优 5 张，支持判断：

| 牌型 | 英文 | 优先级 |
|------|------|------|
| 皇家同花顺 | Royal Flush | 9 |
| 同花顺 | Straight Flush | 8 |
| 四条 | Four of a Kind | 7 |
| 葫芦 | Full House | 6 |
| 同花 | Flush | 5 |
| 顺子 | Straight | 4 |
| 三条 | Three of a Kind | 3 |
| 两对 | Two Pair | 2 |
| 一对 | One Pair | 1 |
| 高牌 | High Card | 0 |

同牌型时按 kicker 比较大小，正确处理平局（底池平分）。

### 3.4 游戏日志
- 左侧面板（可折叠）实时显示操作日志
- 每条日志带时间戳，颜色区分：下注（金）、弃牌（灰）、赢牌（绿）、系统（白）

---

## 四、AI 对手

### 4.1 AI 玩家配置

| 名字 | 头像 | 风格描述 |
|------|------|------|
| Alex | 🎩 | 保守型，只玩强牌，很少虚张声势 |
| Riley | 🦊 | 激进型，频繁加注，喜欢 bluff |
| Sam | 🌸 | 平衡型，按赔率决策，偶尔诈唬 |
| Jordan | 🎲 | 随机型，决策带随机性，难以预测 |
| Morgan | 🧊 | 数学型，严格按胜率和底池赔率行动 |

### 4.2 LLM 决策调用

每轮 AI 行动时，向 LLM API 发送以下 prompt：

```
System: 你是德州扑克 AI 玩家，只能返回 JSON，不要有任何其他内容。

User:
你是玩家「{name}」，性格风格：{style_description}。

当前牌局状态：
- 你的手牌：{hand_cards}（如：A♠ K♥）
- 公共牌：{community_cards}（未翻出的显示为空）
- 当前阶段：{stage}（preflop/flop/turn/river）
- 底池总额：{pot}
- 你的筹码：{stack}
- 需要跟注额：{to_call}（0 表示可以直接过牌）
- 你在本轮的位置：{position}（dealer/small_blind/big_blind/early/middle/late）
- 本轮其他玩家动作：{action_history}
- 存活玩家数：{active_players}

请根据你的风格特点，给出决策。
返回格式（严格 JSON，无 markdown）：
{"action":"fold|check|call|raise","amount":加注总额或0,"reasoning":"简短中文理由"}
```

调用时注意：
- 超时设置 10 秒，超时自动使用 fallback
- 解析失败自动使用 fallback
- AI 思考期间显示 「{name} 思考中...」 动画（打点）
- 每次调用前加 500~1500ms 随机延迟，模拟真实思考时间

### 4.3 Fallback 本地规则引擎（API 不可用时）

```js
function localAIDecide({ hand, community, toCall, pot, stack, stage, personality }) {
  const handStrength = estimateHandStrength(hand, community); // 0~1
  const potOdds = toCall / (pot + toCall);

  switch(personality) {
    case 'conservative':
      if (handStrength < 0.4 && toCall > 0) return { action: 'fold' };
      if (handStrength > 0.7 && Math.random() < 0.4) return { action: 'raise', amount: pot * 0.75 };
      return { action: toCall > 0 ? 'call' : 'check' };

    case 'aggressive':
      if (handStrength < 0.25 && toCall > stack * 0.3) return { action: 'fold' };
      if (Math.random() < 0.35) return { action: 'raise', amount: pot * (0.5 + Math.random()) };
      return { action: toCall > 0 ? 'call' : 'check' };

    case 'balanced':
      if (handStrength < potOdds) return { action: toCall > 0 ? 'fold' : 'check' };
      if (handStrength > 0.65) return { action: 'raise', amount: pot * 0.6 };
      return { action: toCall > 0 ? 'call' : 'check' };

    case 'random':
      const r = Math.random();
      if (r < 0.2 && toCall > 0) return { action: 'fold' };
      if (r < 0.45) return { action: 'raise', amount: Math.floor(pot * (0.3 + Math.random() * 0.7)) };
      return { action: toCall > 0 ? 'call' : 'check' };

    case 'mathematical':
      if (handStrength <= potOdds && toCall > 0) return { action: 'fold' };
      if (handStrength > 0.75) return { action: 'raise', amount: Math.floor(pot * 0.8) };
      return { action: toCall > 0 ? 'call' : 'check' };
  }
}
```

---

## 五、动画与交互细节

- 洗牌动画：每局开始前 1.5 秒洗牌特效（牌堆展开收起）
- 发牌动画：底牌从庄家位置沿弧线飞到各玩家，每张间隔 80ms，带轻微旋转
- 公共牌揭示：CSS 3D flip（rotateY 0→180deg），逐张间隔 300ms
- 筹码入池：下注时筹码堆向底池方向滑动 + 数字跳动
- 赢牌特效：赢家座位高亮金色描边 + 底池筹码回流动画 + 短暂粒子散射（CSS animation）
- 弃牌：手牌向右滑出 + 变灰
- 玩家轮次高亮：当前行动玩家座位有金色脉冲描边动画（CSS keyframes glow）
- All-in 标签：玩家 all-in 时座位出现红色「ALL IN」闪烁标签

---

## 六、开始界面（主菜单）

进入游戏（已登录用户）后显示主菜单：
- 背景：动态粒子或慢速旋转光晕（纯 CSS，不影响性能）
- 游戏大标题「TEXAS HOLD'EM」（Cinzel 字体，金色 text-shadow glow）
- 当前用户：左上角显示头像 + 昵称
- 菜单按钮：
  - 开始游戏（进入桌面人数选择）
  - 历史对局
  - 设置
  - 切换用户
- 桌面人数选择：4 / 5 / 6 人（卡片式选择，显示 AI 对手预览）

---

## 七、文件结构

```
texas-holdem/
├── index.html
├── vite.config.js
├── package.json
├── src/
│   ├── main.js                  # 入口，路由控制（页面切换）
│   ├── router.js                # 简单哈希路由（#/select-user, #/menu, #/game, #/history, #/settings）
│   │
│   ├── auth/
│   │   ├── storage.js           # localStorage 读写封装（所有 poker_ key 的操作）
│   │   ├── userManager.js       # 创建/删除/查询用户，PIN 验证
│   │   └── session.js           # 当前登录状态（currentUser 全局单例）
│   │
│   ├── pages/
│   │   ├── SelectUser.js        # 用户选择/新建页
│   │   ├── Menu.js              # 主菜单
│   │   ├── Game.js              # 游戏主页
│   │   ├── History.js           # 历史对局页
│   │   └── Settings.js          # 设置页
│   │
│   ├── game/
│   │   ├── engine.js            # 游戏状态机（核心逻辑）
│   │   ├── deck.js              # 牌堆：生成、洗牌、发牌
│   │   ├── handEval.js          # 手牌评估，7 选 5，牌型判断
│   │   ├── pot.js               # 底池与边池计算
│   │   └── gameRecord.js        # 对局结束存档（写入 localStorage）
│   │
│   ├── ai/
│   │   ├── llmPlayer.js         # LLM API 调用，含超时和错误处理
│   │   ├── localPlayer.js       # fallback 本地规则引擎
│   │   └── personalities.js     # 5 个 AI 角色定义
│   │
│   ├── ui/
│   │   ├── Table.js             # 赌桌渲染（椭圆桌 + 座位布局）
│   │   ├── Card.js              # 卡牌组件（正/背面，花色 SVG）
│   │   ├── PlayerSeat.js        # 玩家座位组件
│   │   ├── ActionBar.js         # 操作按钮区（Fold/Check/Call/Raise）
│   │   ├── PotDisplay.js        # 底池金额显示
│   │   ├── GameLog.js           # 游戏日志面板
│   │   └── animations.js        # 动画控制器（发牌、筹码、赢牌特效）
│   │
│   └── styles/
│       ├── variables.css        # CSS 变量（色彩系统、字体）
│       ├── main.css             # 全局样式、布局
│       ├── cards.css            # 卡牌样式与动画
│       ├── table.css            # 赌桌与座位布局
│       ├── buttons.css          # 按钮与操作区
│       └── animations.css       # keyframes 动画定义
```

---

## 八、开发优先级（请按顺序实现）

1. 项目脚手架 + 路由框架 + localStorage 工具函数
2. 用户选择页（新建用户 + 用户列表 + PIN 验证）
3. 游戏核心引擎（牌局状态机 + 手牌评估，先用 console.log 验证逻辑）
4. 基础赌桌 UI（椭圆桌 + 玩家座位 + 公共牌区 + 操作按钮）
5. Balatro 视觉风格（颜色、字体、卡牌样式全面应用）
6. 发牌/翻牌动画
7. AI 决策模块（先 fallback，再接入 LLM API）
8. 历史对局存档 + 历史页 + 统计页
9. 设置页（API 配置 + 个人信息）
10. 主菜单 + 整体页面流转打通
11. 边缘 case（边池、all-in、平局、只剩一人时直接获胜）
12. 音效（可选，洗牌/下注/赢牌音效，Web Audio API 或 .mp3）

---

## 九、注意事项

- API Key 存 localStorage 明文，在设置页用 password input 展示，README 注明「仅供个人使用」
- AI 调用 LLM 超时（10s）或解析失败时，静默切换 fallback，不弹出错误
- 移动端适配：最低支持 768px 宽度，赌桌在窄屏下自动缩放
- 手牌评估需覆盖所有边界情况：A 可作低牌（A-2-3-4-5 顺子）
- 每局结束时自动存档（游戏时长从发底牌开始计时）
- 用户筹码归零时，弹出「补充筹码」提示，一键恢复初始筹码
- 代码注释保持可读性，关键算法（手牌评估、边池计算）必须有注释

---

## 开始前请先问我

在开始编写代码前，请先询问我：
1. AI 对手的 LLM API 接口地址（Base URL）
2. API Key
3. 偏好的模型名称

如果我暂时不提供，先用本地规则引擎实现 AI，在设置页预留好 API 配置入口，后续填写即可生效。