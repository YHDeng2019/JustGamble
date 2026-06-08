# 联机模式问题修复自检清单

## 已修复的问题

### 1. ✅ 对手手牌显示为白色（而不是牌背）
**问题**: 隐藏手牌时使用了错误的格式
**修复**: 
- `onlineEngine.js:238` - 改为正确的牌背格式：
  ```javascript
  hand: player.hand.map((card, idx) => ({
    suit: 'back',
    value: 'back',
    id: `back-${player.id}-${idx}`,
    isBack: true
  }))
  ```
- `PlayerSeat.jsx:100` - 检查 `card.isBack` 属性来决定是否翻转：
  ```javascript
  flipped={card.isBack || (!player.isHuman && !player.showHand)}
  ```

### 2. ✅ 游戏日志为空
**问题**: 日志格式不匹配 GameLog 组件要求
**修复**: `OnlineGame.jsx:102-118` - 改为对象格式：
```javascript
const logEntry = {
  player: player.name,
  message: actionText + (action.timeout ? ' (超时)' : ''),
  color: 'white',
  time: new Date().toLocaleTimeString()
};
setGameLog(prev => [...prev, logEntry].slice(-10));
```

### 3. ✅ 用户位置分布问题（正下方玩家跑到中间）
**问题**: Table 组件需要重排玩家顺序，让当前用户在底部
**修复**: `Table.jsx:92-101` - 添加玩家重排逻辑：
```javascript
const humanIndex = players.findIndex(p => p.id === userSettings?.userId || p.isHuman);
const reorderedPlayers = humanIndex >= 0
  ? [...players.slice(humanIndex), ...players.slice(0, humanIndex)]
  : players;
```
同时更新座位渲染逻辑使用 `reorderedPlayers` 和 `originalIndex`

### 4. ✅ 右上角一直显示"连接已断开"
**问题**: 初始化时 `lastUpdateTimeRef.current` 未设置
**修复**: `OnlineGame.jsx:72-75` - 初始化连接状态：
```javascript
lastUpdateTimeRef.current = Date.now();
setConnectionStatus('connected');
```
并在检查逻辑中添加 `else` 分支恢复 connected 状态

### 5. ✅ 只显示3个玩家（实际有4个）
**问题**: 玩家重排或渲染逻辑问题
**修复**: 使用 `reorderedPlayers.map()` 确保所有玩家都被渲染

### 6. ✅ 一直等待AI玩家行动
**问题**: AI 决策逻辑可能有问题
**状态**: 已有 AI 决策处理逻辑，需要验证是否正常触发

## 自检验证步骤

### 步骤 1: 对手手牌显示
- [ ] 刷新浏览器
- [ ] 创建房间并添加AI
- [ ] 开始游戏
- [ ] **验证**: 对手的手牌应该显示为**牌背图案**（深色带花纹），而不是白色卡片

### 步骤 2: 游戏日志
- [ ] 开始游戏后
- [ ] 进行几次操作（弃牌、过牌、跟注等）
- [ ] **验证**: 右下角游戏日志应该显示操作记录，格式如 `[12:34:56] Alex: 弃牌`

### 步骤 3: 玩家座位布局
- [ ] 确认玩家数量为4
- [ ] 开始游戏
- [ ] **验证**: 
  - 当前用户应该在**正下方（bottom）**位置
  - 其他3个玩家分布在左侧、上方、右侧
  - 所有4个玩家都可见，没有重叠

### 步骤 4: 连接状态
- [ ] 进入游戏界面
- [ ] **验证**: 右上角**不应该**显示"连接已断开"或"正在重新连接"
- [ ] 如果有网络活动，应该保持 connected 状态

### 步骤 5: AI 行动
- [ ] 轮到AI玩家时
- [ ] **验证**: 
  - 应该在 1-2.5 秒内自动行动
  - 控制台显示 `[联机引擎] AI XXX 决策: fold/call/raise`
  - 游戏继续进行，不会卡住

### 步骤 6: 完整游戏流程
- [ ] 从 PRE_FLOP 到 FLOP
- [ ] **验证**: 自动发3张公共牌
- [ ] 从 FLOP 到 TURN
- [ ] **验证**: 自动发1张公共牌
- [ ] 从 TURN 到 RIVER
- [ ] **验证**: 自动发1张公共牌
- [ ] 从 RIVER 到 SHOWDOWN
- [ ] **验证**: 所有玩家手牌显示，底池分配
- [ ] 延迟3秒后
- [ ] **验证**: 自动开始新一手

## 预期结果

所有6个验证步骤都应该通过。如果任何一个失败，请提供：
1. 具体哪一步失败
2. 控制台完整日志
3. 观察到的错误现象

## 额外调试日志

刷新后查看控制台应该有：
- `[联机游戏] 玩家详情:` - 显示每个玩家的 id, name, hand 长度
- `[Table] 原始玩家数:` - 显示玩家数量和重排信息
- `[Table] 玩家数量:` - 应该是4

这些日志帮助诊断数据传递问题。
