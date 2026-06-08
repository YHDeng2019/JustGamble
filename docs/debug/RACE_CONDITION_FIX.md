# AI 卡住问题的根本原因与修复

## 问题诊断

根据用户提供的控制台日志，发现游戏卡在 Jordan (索引1) 时：

```
[Log] [联机引擎] checkAndExecuteAI 被调用, isHost: true aiDecisionPending: true
```

关键发现：**当轮到下一个 AI (Jordan) 时，`aiDecisionPending` 仍然是 `true`**

## 根本原因：竞态条件

### 错误的执行时间线

原代码中，锁的释放在 Firebase `update()` **之后**：

```javascript
await update(ref(db, `rooms/${this.roomId}/gameState`), { ... });

console.log(`[联机引擎] AI ${name} 状态已推送到Firebase`);

this.aiDecisionPending = false;  // ❌ 释放太晚了
```

实际执行顺序：
1. 调用 `await update(...)` (第385行)
2. **Firebase 立即广播状态变化** (在 await 返回前)
3. `onValue` 监听器触发 → `applyServerState` → `checkAndExecuteAI`
4. **此时 `aiDecisionPending` 还是 `true`** → 跳过 Jordan 的决策
5. 然后 `update()` 才返回
6. 然后才执行第398行的日志和第401行的锁释放

**结果**：Jordan 的 AI 决策永远不会被触发，游戏卡住。

### 日志证据

```
[Log] [联机引擎] AI推送新状态 sequence: 1 → 2          // 第383行
[Log] [联机引擎] 应用服务器状态 sequence: 2 ...        // Firebase 立即触发
[Log] [联机引擎] checkAndExecuteAI ... aiDecisionPending: true  // 锁还没释放！
[Log] [联机引擎] AI Alex 状态已推送到Firebase        // 第398行（很久之后）
```

## 修复方案

**在调用 Firebase update 之前就释放锁**：

```javascript
// 关键修复：在 update 之前释放锁
// Firebase 的 onValue 监听器可能在 await 返回前就触发
// 如果锁在 update 后才释放，下一个 AI 检查会被阻塞
this.aiDecisionPending = false;

await update(ref(db, `rooms/${this.roomId}/gameState`), { ... });

console.log(`[联机引擎] AI ${name} 状态已推送到Firebase`);
```

### 修复后的执行时间线

1. 执行 `executeAction`
2. **立即释放锁** (`aiDecisionPending = false`)
3. 调用 `await update(...)`
4. Firebase 广播 → `onValue` 触发 → `checkAndExecuteAI`
5. **锁已经是 `false`**，Jordan 的 AI 决策正常执行 ✅

## 修改位置

**文件**: `src/game/onlineEngine.js`  
**行数**: 385-401  
**修改内容**: 将 `this.aiDecisionPending = false;` 从第401行移动到第385行之前

## 验证步骤

1. 刷新浏览器
2. 创建房间 + 添加 2-3 个 AI
3. 开始游戏
4. 观察控制台日志，应该看到：
   ```
   [联机引擎] checkAndExecuteAI ... aiDecisionPending: false
   [联机引擎] 触发AI决策: Jordan
   [联机引擎] AI Jordan 决策结果: ...
   ```

## 相关问题

这个竞态条件也是之前所有"序列号修复"无法解决卡顿的真正原因：
- 序列号机制 ✅ 正确防止了乱序
- 但锁释放时机 ❌ 导致后续 AI 无法被触发

两个问题必须同时修复才能完全解决 AI 卡住的问题。
