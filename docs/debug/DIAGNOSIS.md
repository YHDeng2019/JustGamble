# 联机模式问题诊断

## 问题3：AI卡住的根本原因分析

### 竞态条件时序图

```
时间轴：
T0: Morgan轮次开始，currentPlayerIndex = 1
T1: checkAndExecuteAI() 被调用，aiDecisionPending = true
T2: setTimeout 延迟 1-2.5秒
T3: AI决策完成，executeAction('call', 100)
T4:   → engine.executeAction() 内部调用 nextPlayer()
T5:   → currentPlayerIndex 变为 2 (下一个玩家)
T6:   → 推送新状态到 Firebase {currentPlayerIndex: 2, lastUpdate: T6}
T7: aiDecisionPending = false
T8: Firebase 触发 applyServerState
T9:   → 收到的状态：{currentPlayerIndex: 2, lastUpdate: T6}
T10:  → 应用状态，currentPlayerIndex = 2 ✓
T11:  → Promise.resolve().then(() => checkAndExecuteAI())
T12: checkAndExecuteAI() 检查 index=2 的玩家 ✓

问题场景（竞态）：
T8: Firebase 触发 applyServerState (可能是旧的更新)
T9:   → 收到的状态：{currentPlayerIndex: 1, lastUpdate: T5} (旧状态!)
T10:  → 应用状态，currentPlayerIndex = 1 (回滚!) ✗
T11:  → Promise.resolve().then(() => checkAndExecuteAI())
T12: checkAndExecuteAI() 再次检查 index=1 (Morgan)
T13: 但 aiDecisionPending 已经是 false，且 Morgan.hasActed = true
T14: 不满足执行条件，跳过
T15: 游戏卡住，没有人推进流程
```

### 根本原因

**lastProcessedUpdate 防重机制失效**：
- `lastProcessedUpdate` 只比较时间戳
- 但 Firebase 可能乱序推送更新（网络延迟、重连等）
- 即使有时间戳检查，旧状态也可能通过检查（如果 `lastUpdate` 字段被更新但内容是旧的）

### 解决方案

#### 方案A：序列号机制（推荐）
```javascript
// 每次状态更新增加序列号
await update(ref(db, `rooms/${this.roomId}/gameState`), {
  ...newState,
  lastUpdate: Date.now(),
  sequence: (serverState.sequence || 0) + 1  // 递增序列号
});

// applyServerState 中检查
if (serverState.sequence <= this.lastProcessedSequence) {
  console.warn('[联机引擎] 收到过期状态，跳过');
  return;
}
this.lastProcessedSequence = serverState.sequence;
```

#### 方案B：状态快照比对
```javascript
// 在 checkAndExecuteAI 开始时保存快照
const snapshotPlayerIndex = this.engine.currentPlayerIndex;
const snapshotPlayerId = this.engine.players[snapshotPlayerIndex].id;

// AI 决策完成后验证状态未被污染
if (this.engine.currentPlayerIndex !== snapshotPlayerIndex + 1) {
  console.error('[联机引擎] 状态被意外修改，中止');
  return;
}
```

#### 方案C：房主单线程队列
```javascript
// 将所有状态更新放入队列，串行执行
this.updateQueue = [];
this.isProcessingQueue = false;

async processQueue() {
  if (this.isProcessingQueue) return;
  this.isProcessingQueue = true;
  
  while (this.updateQueue.length > 0) {
    const task = this.updateQueue.shift();
    await task();
  }
  
  this.isProcessingQueue = false;
}
```

## 问题2：游戏日志为空

### 可能原因
1. `engine.gameLog` 初始化为空数组，但 `initGame` 时未调用 `addLog`
2. `getGameState()` 返回了空的 `gameLog` 副本
3. Firebase 状态中 `gameLog` 字段丢失或为 `undefined`

### 验证方法
在浏览器控制台运行：
```javascript
// 检查 Firebase 中的实际数据
import { ref, get } from 'firebase/database';
import { getFirebaseDB } from './services/firebase';

const db = getFirebaseDB();
const snapshot = await get(ref(db, 'rooms/YOUR_ROOM_ID/gameState'));
console.log('Firebase gameLog:', snapshot.val().gameLog);
```

## 问题4：玩家视角定位

### 当前逻辑
```javascript
// Table.jsx 第94行
const humanIndex = userSettings?.userId
  ? players.findIndex(p => p.id === userSettings.userId)
  : players.findIndex(p => p.isHuman);
```

### 潜在问题
- `userSettings` 可能未正确传递
- `players[i].id` 与 `user.userId` 格式不匹配（字符串 vs 数字）
- Firebase 中的玩家顺序与本地引擎顺序不同步

### 验证方法
在浏览器控制台运行：
```javascript
// 检查玩家数组和当前用户ID
console.log('玩家数组:', gameState.players.map(p => ({id: p.id, name: p.name})));
console.log('当前用户ID:', user.userId);
console.log('userSettings:', userSettings);
```

## 问题1：UI布局不一致

### 已修复内容
- ✓ 添加设置下拉菜单
- ✓ 添加手牌提示
- ✓ 传递 stealthMode/soundEnabled props

### 待验证
- 是否缺少其他单人模式特有的UI元素（如胜利动画、结算面板）
- CSS样式是否完全相同
