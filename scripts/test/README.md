# 测试脚本说明

本目录包含联机模式的自动化测试脚本。

## 脚本列表

### 完整测试
- **test-all-issues.mjs** - 验证所有4个问题（UI、日志、AI卡住、玩家位置）
- **test-complete.mjs** - 完整测试套件
- **test-full-flow.mjs** - 完整流程测试

### 专项测试
- **test-online.mjs** - 联机模式基础测试
- **test-online-final.mjs** - 联机模式最终验证
- **test-final-simple.mjs** - 简单的30秒观察测试

### 诊断工具
- **diagnose.cjs** - 静态代码分析工具
- **diagnose-simple.mjs** - 简化诊断脚本
- **diagnose-ui.mjs** - UI 诊断工具

### 页面检查
- **check-page.mjs** - 页面检查
- **check-waiting-room.mjs** - 等待室检查

### 验证工具
- **final-test.mjs** - 最终测试
- **final-verification.mjs** - 最终验证

## 使用方法

### 前置条件
```bash
npm install playwright
```

### 运行测试
```bash
# 启动开发服务器
npm run dev

# 在另一个终端运行测试
node scripts/test/test-all-issues.mjs
```

## 测试结果

测试结果存储在 `scripts/test-results/` 目录。

## 注意事项

- 测试前确保开发服务器运行在 http://localhost:5173
- 某些测试需要 Firebase 配置
- 自动化测试仅验证基础功能，完整的多人测试需要手动进行
