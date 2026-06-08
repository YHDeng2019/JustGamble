# 🎯 联机模式体验优化计划

## ✅ 已确认对齐的功能
- AI 思考时间拟人化：700-2700ms 动态计算 ✅
- All-in 戏剧效果：1400ms ✅
- 获胜 Toast 延迟：摊牌 6500ms，弃牌 3500ms ✅
- ActionBar 延迟：600ms ✅
- 音效系统：完整 ✅

## ❌ 需要立即修复的差异

### 1. 缺少发牌动画
**问题**: OnlineGame 启动后直接显示手牌，没有逐张发牌的仪式感
**单人模式**: 150ms/张，有发牌音效
**修复方案**: 在 OnlineGame.jsx 中添加 animateDealing 逻辑

### 2. 缺少快速摊牌逻辑
**问题**: 所有人 All-in 后应该快速翻牌（400ms/阶段）
**单人模式**: quickDealToShowdown 函数
**修复方案**: 在 onlineEngine.js 中添加 quickShowdown 检测

### 3. 缺少回合循环
**问题**: 一局结束后无法开始下一局
**单人模式**: finishRound → startNextRound
**修复方案**: 实现完整的回合结束和新手牌开始流程

### 4. 缺少阶段切换停顿
**问题**: Flop/Turn/River 出现时是否有 800ms 停顿让玩家看清？
**单人模式**: processTurn 中有明确的阶段切换延迟
**修复方案**: 需要检查 onlineEngine 是否有相同逻辑

### 5. 缺少游戏历史
**问题**: 无法记录和回顾对局
**单人模式**: sessionHistory + addGameHistory
**修复方案**: 添加联机对局历史记录

---

## 📋 优化任务清单

### Phase 1: 核心体验对齐（P0）
- [ ] Task 1: 添加发牌动画到 OnlineGame
- [ ] Task 2: 实现快速摊牌逻辑
- [ ] Task 3: 实现回合循环（下一局）
- [ ] Task 4: 确认阶段切换停顿
- [ ] Task 5: 检查破产玩家处理

### Phase 2: 游戏流程完善（P1）
- [ ] Task 6: 添加游戏历史记录
- [ ] Task 7: 添加胜利/结算界面
- [ ] Task 8: 优化房主离开处理

### Phase 3: 社交功能（P2）
- [ ] Task 9: 添加简单聊天
- [ ] Task 10: 添加快捷表情

### Phase 4: 新手友好（P2）
- [ ] Task 11: 添加新手教程
- [ ] Task 12: 添加牌型说明

---

## 🚀 开始执行

从 Task 1 开始逐个实施...
