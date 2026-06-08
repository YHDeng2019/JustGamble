# JustGamble 联机模式开发文档

本目录包含联机模式开发过程中的所有调试文档和修复记录。

## 文档目录

### 修复记录
- **RACE_CONDITION_FIX.md** - AI 卡住问题的根本原因（竞态条件）
- **TIMING_FIXED.md** - 时间配置对齐单人模式
- **FIX_SUMMARY.md** - 问题修复总结

### 诊断分析
- **DIAGNOSIS.md** - 初始问题诊断
- **CODE_REVIEW.md** - 代码审查报告
- **TIMING_COMPARISON.md** - 单人/联机模式时间对比

### 测试指南
- **TEST_GUIDE.md** - 测试指南
- **ONLINE_TEST_CHECKLIST.md** - 在线测试清单
- **FIX_VERIFICATION.md** - 修复验证

### 项目状态
- **ONLINE_MODE_COMPLETE.md** - 联机模式完成状态
- **FINAL_STATUS.md** - 最终状态报告

## 主要修复

### 1. AI 卡住问题（已修复）
**问题**：序列号机制 + 竞态条件导致 AI 决策锁未释放  
**修复**：
- 序列号从 `state.sequence`（不存在）改为 `lastProcessedSequence`
- AI 决策锁在 Firebase update 之前释放

### 2. 时间配置对齐（已修复）
所有延迟、动画时间完全对齐单人模式：
- AI 思考时间：700-2700ms（动态）
- 阶段切换：800ms
- Toast 显示：摊牌 6500ms，弃牌 3500ms
- All-in 效果：1400ms
- 快速摊牌：400ms/阶段

### 3. 状态同步问题（已修复）
- 深拷贝玩家状态，避免引用累积
- 筹码为0的玩家跳过操作

## 测试脚本

测试脚本位于 `scripts/test/` 目录，包含自动化测试工具。

## 相关文件

- `src/game/onlineEngine.js` - 联机引擎核心
- `src/pages/OnlineGame.jsx` - 联机游戏页面
- `src/services/roomService.js` - 房间管理
- `src/services/firebase.js` - Firebase 配置
