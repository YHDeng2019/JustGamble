# Firebase 在 JustGamble 项目中的作用

## 核心功能：联机多人游戏的实时数据同步后端

Firebase 提供了**无服务器的实时数据库**，让多个玩家可以在不同浏览器中同步游戏状态，实现真正的联机对战。

---

## 详细说明

### 1. 为什么需要 Firebase？

**单人模式**：所有数据存储在浏览器的 `localStorage`，游戏引擎运行在本地
- ✅ 优点：无需后端，完全离线
- ❌ 缺点：无法多人联机

**联机模式**：需要一个中央服务器同步所有玩家的游戏状态
- 传统方案：自己写后端（Node.js + WebSocket）
- Firebase 方案：使用 Firebase Realtime Database（无需自己写后端）

---

## Firebase 在项目中的具体作用

### 1. 房间管理（`roomService.js`）

```javascript
// 数据结构
rooms/
  {roomId}/
    roomCode: "ABC123"        // 6位房间码
    hostId: "user_xxx"        // 房主ID
    status: "waiting"         // 状态：waiting | playing | finished
    settings: {               // 游戏配置
      maxPlayers: 4
      initialChips: 1000
      smallBlind: 10
      bigBlind: 20
    }
    players: {                // 玩家列表
      {userId}: {
        displayName: "Fiona"
        avatar: "🌸"
        chips: 1000
        isOnline: true
        isBot: false
      }
    }
```

**功能**：
- 创建房间并生成房间码
- 通过房间码加入房间
- 管理房间内玩家列表
- 添加 AI 机器人补位

---

### 2. 游戏状态实时同步（`onlineEngine.js`）

这是 Firebase 最核心的作用！

```javascript
// 游戏状态存储在 Firebase
rooms/{roomId}/gameState/
  stage: "PRE_FLOP"           // 当前阶段
  players: [...]              // 每个玩家的手牌、筹码、下注
  communityCards: [...]       // 公共牌
  pot: 150                    // 底池
  currentPlayerIndex: 2       // 当前轮到谁
  sequence: 15                // 序列号（防止乱序）
  lastUpdate: 1686123456789   // 最后更新时间
```

**工作流程**：

1. **房主推送状态** → Firebase
   ```javascript
   // 房主执行 AI 决策或处理玩家动作后
   await update(ref(db, `rooms/${roomId}/gameState`), {
     ...newState,
     sequence: nextSequence,
     lastUpdate: Date.now()
   });
   ```

2. **所有客户端监听变化** ← Firebase
   ```javascript
   // 每个玩家的浏览器都在监听
   onValue(ref(db, `rooms/${roomId}/gameState`), (snapshot) => {
     const serverState = snapshot.val();
     // 更新本地游戏界面
     setGameState(serverState);
   });
   ```

3. **结果**：所有玩家看到的游戏状态实时同步
   - 房主：看到自己和所有 AI 的操作
   - 其他玩家：看到相同的牌桌、底池、公共牌
   - 延迟：通常 50-200ms

---

### 3. 玩家动作传递（`onlineEngine.js`）

非房主玩家的操作需要通过 Firebase 传递给房主：

```javascript
// 数据结构
rooms/{roomId}/actions/
  {actionId}: {
    userId: "user_xxx"
    action: "raise"
    amount: 100
    timestamp: 1686123456789
  }
```

**流程**：
1. 玩家 Fiona 点击"加注100" → 推送到 Firebase
2. 房主的浏览器监听到新动作 → 执行引擎逻辑
3. 房主推送新的游戏状态 → 所有人同步

---

### 4. 心跳检测（`heartbeatService.js`）

检测玩家是否在线：

```javascript
// 每5秒发送一次心跳
rooms/{roomId}/players/{userId}/
  lastHeartbeat: 1686123456789

// 房主检测：15秒无心跳 → 标记离线 → 自动弃牌
```

---

### 5. 公开房间大厅（可选）

如果创建公开房间，会显示在大厅列表：

```javascript
lobby/publicRooms/
  {roomId}: {
    roomCode: "ABC123"
    hostName: "Fiona"
    playerCount: 2
    maxPlayers: 4
    status: "waiting"
  }
```

---

## Firebase vs 传统后端对比

| 功能 | Firebase | 传统后端（Node.js + WebSocket） |
|------|----------|-------------------------------|
| 实时同步 | ✅ 内置 | 需要自己实现 WebSocket |
| 数据存储 | ✅ 内置 | 需要自己配置数据库 |
| 部署运维 | ✅ 无需管理服务器 | 需要部署和维护服务器 |
| 费用 | 免费额度（1GB存储 + 10GB/月下载） | VPS 费用（$5-20/月） |
| 防作弊 | ❌ 客户端执行逻辑 | ✅ 服务端验证 |

---

## 项目中的 Firebase 配置

### 环境变量（`.env`）
```bash
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
VITE_FIREBASE_PROJECT_ID=your-project-id
```

### 使用的 Firebase 服务
- ✅ **Realtime Database**（实时数据库）- 核心功能
- ❌ Authentication（认证）- 未使用，用户管理在 localStorage
- ❌ Storage（存储）- 未使用
- ❌ Cloud Functions（云函数）- 未使用

---

## 总结

Firebase 在这个项目中就是**联机模式的大脑和神经系统**：

1. **大脑**：存储游戏状态（谁的回合、底池、手牌、公共牌）
2. **神经系统**：实时同步所有玩家的浏览器
3. **通讯员**：传递玩家操作给房主

**没有 Firebase**：
- ✅ 单人模式仍然可以玩（AI 对战）
- ❌ 联机模式完全无法使用

**有了 Firebase**：
- ✅ 多个玩家可以在不同设备上一起玩
- ✅ 实时看到彼此的操作
- ✅ 无需自己搭建后端服务器
