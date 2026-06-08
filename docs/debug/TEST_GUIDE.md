# 联机模式测试指南

## 测试准备

1. **启动开发服务器**（如果还没启动）：
```bash
npm run dev
```

2. **打开浏览器**，访问 http://localhost:5173

3. **打开开发者工具**（F12 或 Cmd+Option+I）

## 测试步骤

### 测试1：验证序列号机制（解决AI卡住问题）

**操作**：
1. 创建房间，添加2个AI机器人（Riley和Morgan）
2. 开始游戏
3. 在控制台观察日志

**预期结果**：
```
[联机引擎] 应用服务器状态 sequence: 1 stage: PRE_FLOP currentPlayer: 0
[联机引擎] checkAndExecuteAI - 当前玩家: Riley isHuman: false hasActed: false
[联机引擎] 触发AI决策: Riley index: 0
[联机引擎] AI Riley 决策结果: call 20
[联机引擎] AI Riley 状态已推送到Firebase

[联机引擎] 应用服务器状态 sequence: 2 stage: PRE_FLOP currentPlayer: 1
[联机引擎] checkAndExecuteAI - 当前玩家: Morgan isHuman: false hasActed: false
[联机引擎] 触发AI决策: Morgan index: 1
[联机引擎] AI Morgan 决策结果: raise 40
[联机引擎] AI Morgan 状态已推送到Firebase

[联机引擎] 应用服务器状态 sequence: 3 stage: PRE_FLOP currentPlayer: 2
...继续到下一个玩家
```

**异常情况（已修复）**：
如果看到这样的日志，说明遇到了旧状态：
```
[联机引擎] 收到过期状态 sequence: 1 当前: 2 跳过
```
但游戏应该能继续，不会卡住。

**失败标志**：
- ❌ AI停在某个玩家不动超过5秒
- ❌ 控制台显示 "收到过期状态" 后游戏卡住
- ❌ sequence 号码没有递增

### 测试2：验证游戏日志显示

**操作**：
1. 游戏开始后，点击右上角的"游戏日志"
2. 观察是否有内容

**预期结果**：
```
[09:30:15] 系统: 游戏开始！
[09:30:16] 系统: 发牌中...
[09:30:17] 系统: 进入翻牌前阶段
[09:30:19] Riley: 跟注 20
[09:30:21] Morgan: 加注到 40
...
```

**调试方法**（如果日志为空）：
在控制台运行：
```javascript
// 检查 gameState.gameLog
console.log('gameLog内容:', gameState.gameLog);
console.log('gameLog长度:', gameState.gameLog?.length);

// 如果是undefined，检查Firebase
import { ref, get } from 'firebase/database';
const snapshot = await get(ref(db, `rooms/${roomId}/gameState`));
console.log('Firebase中的gameLog:', snapshot.val().gameLog);
```

### 测试3：验证玩家视角定位

**操作**：
1. 创建房间（假设你的用户名是Fiona）
2. 添加1个AI（Morgan）
3. 开始游戏
4. 观察牌桌布局

**预期结果**：
- Fiona应该在屏幕正下方（底部中央）
- Morgan应该在屏幕上方（顶部）

**调试方法**（如果位置不对）：
在控制台运行：
```javascript
// 检查玩家数组和用户ID
console.log('玩家列表:', gameState.players.map((p, i) => 
  `${i}: ${p.name} (id=${p.id})`
));
console.log('当前用户ID:', user.userId);
console.log('userSettings:', userSettings);

// 检查Table组件的日志
// 应该能看到：
// [Table] 当前用户ID: user_xxx 找到的玩家索引: 0 总玩家数: 2
```

**失败标志**：
- ❌ 找到的玩家索引不是0（第一个）
- ❌ userId 不匹配（字符串 vs 数字类型不同）

### 测试4：验证UI布局一致性

**操作**：
1. 先进入单人模式，观察界面
2. 退出后进入联机模式
3. 对比两个界面

**检查项**：
- ✅ 右上角有设置按钮（⚙️）
- ✅ 点击设置按钮，出现"摸鱼模式"和"音效"开关
- ✅ 轮到你时，底部显示"● 轮到你了"和"当前牌型"提示
- ✅ 游戏日志在右上角
- ✅ 底池显示在牌桌中央

**差异记录**：
如果发现不一致，截图或描述具体位置

## 完整测试流程（推荐）

### 场景A：两个真人玩家

1. **浏览器1**：创建房间，获取房间码
2. **浏览器2**（隐身窗口）：用不同用户加入房间
3. **浏览器1**：开始游戏
4. **验证**：
   - 浏览器1看到自己在底部
   - 浏览器2看到自己在底部（不同玩家）
   - 两个浏览器的游戏日志都有内容
   - 轮流行动正常，没有卡住

### 场景B：真人 + AI混合

1. 创建房间，添加2个AI
2. 开始游戏
3. **验证**：
   - AI依次行动（Riley → Morgan → 下一位）
   - 控制台sequence号递增（1 → 2 → 3 → ...）
   - 没有"收到过期状态"后卡住的情况
   - 游戏能完整走完一局（PRE_FLOP → FLOP → TURN → RIVER → SHOWDOWN）

## 常见问题排查

### 问题：AI卡住不动

**检查**：
```javascript
// 控制台搜索 "aiDecisionPending"
// 应该看到 true → false 的切换
```

**可能原因**：
1. sequence 机制失效 → 检查是否有 "收到过期状态" 日志
2. aiDecisionPending 死锁 → 刷新页面重试
3. Firebase连接断开 → 检查网络

### 问题：游戏日志为空

**检查**：
```javascript
// 1. 检查引擎是否调用了 addLog
console.log('engine.gameLog:', engineRef.current?.engine?.gameLog);

// 2. 检查 Firebase 数据
// (需要在代码中添加)
```

**可能原因**：
1. `engine.gameLog` 未初始化
2. `getGameState()` 没有包含 `gameLog`
3. Firebase 更新时 `gameLog` 字段丢失

### 问题：玩家位置不对

**检查**：
```javascript
// 确认 userId 匹配
const humanIndex = gameState.players.findIndex(p => {
  console.log('比较:', p.id, '===', user.userId, '结果:', p.id === user.userId);
  return p.id === user.userId;
});
console.log('找到索引:', humanIndex);
```

**可能原因**：
1. `userSettings` 未传递
2. userId 类型不匹配（字符串 vs 数字）
3. Firebase 中玩家 ID 格式不同

## 成功标准

全部测试通过的标志：

1. ✅ AI 能连续行动，不会卡住
2. ✅ 游戏日志有完整内容
3. ✅ 每个玩家在自己视角看到自己在底部
4. ✅ UI布局与单人模式完全一致
5. ✅ 能完整打完一局游戏
6. ✅ 控制台没有红色错误
7. ✅ sequence 号码单调递增，没有回退

## 测试结果反馈

测试完成后，请提供：

1. **成功的测试**：列出通过的测试编号
2. **失败的测试**：
   - 测试编号
   - 具体现象
   - 控制台日志截图或文本
   - 浏览器截图
3. **控制台完整日志**：
   - 从创建房间到问题出现的全部日志
   - 使用 `console.save()` 或右键 → Save as...

## 自动化测试脚本（可选）

在控制台运行：
```javascript
// 验证序列号递增
let lastSeq = 0;
let errors = 0;
const originalLog = console.log;
console.log = function(...args) {
  if (args[0]?.includes('应用服务器状态 sequence:')) {
    const match = args[0].match(/sequence: (\d+)/);
    if (match) {
      const seq = parseInt(match[1]);
      if (seq <= lastSeq) {
        console.error('❌ 序列号回退！', seq, '<=', lastSeq);
        errors++;
      } else {
        console.info('✅ 序列号递增', lastSeq, '→', seq);
      }
      lastSeq = seq;
    }
  }
  originalLog.apply(console, args);
};

console.log('监控已启动，errors:', errors);
```
