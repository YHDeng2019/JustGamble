#!/usr/bin/env node

/**
 * 联机模式问题验证脚本
 *
 * 由于无法直接访问浏览器，这个脚本会：
 * 1. 分析代码逻辑
 * 2. 识别潜在问题
 * 3. 生成具体的修复建议
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 联机模式问题诊断\n');

// 读取关键文件
const projectRoot = '/Users/dengyihui/Desktop/数智创新/项目/JustGamble';
const files = {
  onlineEngine: fs.readFileSync(path.join(projectRoot, 'src/game/onlineEngine.js'), 'utf-8'),
  onlineGame: fs.readFileSync(path.join(projectRoot, 'src/pages/OnlineGame.jsx'), 'utf-8'),
  table: fs.readFileSync(path.join(projectRoot, 'src/ui/Table.jsx'), 'utf-8'),
  engine: fs.readFileSync(path.join(projectRoot, 'src/game/engine.js'), 'utf-8'),
};

let issues = [];
let fixes = [];

// 问题1：检查 gameLog 是否正确传递
console.log('📝 问题2：游戏日志为空');
console.log('─────────────────────────');

// 检查 engine.js 中是否有 addLog 调用
const addLogCalls = (files.engine.match(/this\.addLog\(/g) || []).length;
console.log(`✓ engine.js 中有 ${addLogCalls} 处 addLog 调用`);

// 检查 getGameState 是否返回 gameLog
if (files.engine.includes('gameLog: [...this.gameLog]')) {
  console.log('✓ engine.getGameState() 返回 gameLog');
} else {
  console.log('✗ engine.getGameState() 可能没有返回 gameLog');
  issues.push('engine.getGameState() 缺少 gameLog 字段');
}

// 检查 onlineEngine 的 getVisibleState 是否保留 gameLog
if (files.onlineEngine.includes('return {\n      ...state,\n      players: visiblePlayers\n    };')) {
  console.log('✓ onlineEngine.getVisibleState() 使用 spread 保留了 gameLog');
} else {
  console.log('✗ onlineEngine.getVisibleState() 可能丢失了 gameLog');
  issues.push('getVisibleState 返回值可能不包含 gameLog');
}

// 检查 OnlineGame.jsx 是否正确使用 gameLog
if (files.onlineGame.includes('logs={gameState.gameLog || []}')) {
  console.log('✓ OnlineGame.jsx 传递了 gameState.gameLog');
} else {
  console.log('✗ OnlineGame.jsx 没有正确传递 gameLog');
  issues.push('OnlineGame.jsx 未正确传递 gameLog 到 GameLog 组件');
}

console.log('\n📍 问题4：玩家视角定位');
console.log('─────────────────────────');

// 检查 Table.jsx 的重排逻辑
if (files.table.includes('userSettings?.userId\n    ? players.findIndex(p => p.id === userSettings.userId)')) {
  console.log('✓ Table.jsx 优先使用 userId 匹配');
} else if (files.table.includes('p.id === userSettings?.userId || p.isHuman')) {
  console.log('✗ Table.jsx 仍在使用错误的匹配逻辑（会匹配第一个 isHuman）');
  issues.push('Table.jsx 玩家重排逻辑错误：使用了 || p.isHuman');
  fixes.push({
    file: 'src/ui/Table.jsx',
    issue: '玩家重排逻辑在联机模式会匹配到第一个真人玩家而非当前用户',
    fix: `
  const humanIndex = userSettings?.userId
    ? players.findIndex(p => p.id === userSettings.userId)
    : players.findIndex(p => p.isHuman);
`
  });
} else {
  console.log('? Table.jsx 玩家重排逻辑未找到');
}

// 检查 OnlineGame 是否传递了 userSettings
if (files.onlineGame.includes('userSettings={{ userId: user.userId }}')) {
  console.log('✓ OnlineGame.jsx 传递了 userSettings');
} else {
  console.log('✗ OnlineGame.jsx 未传递 userSettings');
  issues.push('OnlineGame.jsx 未传递 userSettings 到 Table');
}

console.log('\n🤖 问题3：AI卡住');
console.log('─────────────────────────');

// 检查序列号机制
if (files.onlineEngine.includes('this.lastProcessedSequence = 0')) {
  console.log('✓ 已添加序列号机制');
} else {
  console.log('✗ 缺少序列号机制');
  issues.push('onlineEngine 缺少序列号防止状态乱序');
  fixes.push({
    file: 'src/game/onlineEngine.js',
    issue: 'Firebase 状态更新可能乱序，导致 currentPlayerIndex 回滚',
    fix: '添加 sequence 字段并在 subscribeToGameState 中检查'
  });
}

// 检查 Promise.resolve() 修复
if (files.onlineEngine.includes('Promise.resolve().then(() => {')) {
  console.log('✓ 已使用 Promise.resolve() 替代 setTimeout');
} else if (files.onlineEngine.includes('setTimeout(() => {\n        this.checkAndExecuteAI();')) {
  console.log('✗ 仍在使用 setTimeout，可能导致时序问题');
  issues.push('applyServerState 中仍使用 setTimeout 而非 Promise.resolve()');
} else {
  console.log('? AI 触发逻辑未找到');
}

console.log('\n🎨 问题1：UI布局');
console.log('─────────────────────────');

// 检查设置菜单
if (files.onlineGame.includes('settings-menu')) {
  console.log('✓ OnlineGame 包含设置菜单');
} else {
  console.log('✗ OnlineGame 缺少设置菜单');
  issues.push('OnlineGame 缺少设置下拉菜单');
}

// 检查手牌提示
if (files.onlineGame.includes('hand-hint')) {
  console.log('✓ OnlineGame 包含手牌提示');
} else {
  console.log('✗ OnlineGame 缺少手牌提示');
  issues.push('OnlineGame 缺少手牌提示（当前牌型显示）');
}

// 检查 props 传递
if (files.onlineGame.includes('onToggleStealth') && files.onlineGame.includes('onToggleSound')) {
  console.log('✓ OnlineGame 接收了完整的 props');
} else {
  console.log('✗ OnlineGame 缺少 toggle props');
  issues.push('OnlineGame 缺少 onToggleStealth 或 onToggleSound props');
}

// 总结
console.log('\n' + '='.repeat(50));
console.log('📊 诊断总结');
console.log('='.repeat(50));

if (issues.length === 0) {
  console.log('✅ 代码层面未发现明显问题');
  console.log('\n⚠️  但这不代表运行时没有问题！');
  console.log('   需要实际测试才能确认：');
  console.log('   1. Firebase 数据是否正确同步');
  console.log('   2. 状态更新时序是否正确');
  console.log('   3. 浏览器渲染是否符合预期');
} else {
  console.log(`❌ 发现 ${issues.length} 个潜在问题：\n`);
  issues.forEach((issue, i) => {
    console.log(`${i + 1}. ${issue}`);
  });
}

if (fixes.length > 0) {
  console.log('\n🔧 建议的修复：\n');
  fixes.forEach((fix, i) => {
    console.log(`${i + 1}. ${fix.file}`);
    console.log(`   问题: ${fix.issue}`);
    console.log(`   修复: ${fix.fix}`);
    console.log('');
  });
}

console.log('\n📋 下一步行动：');
console.log('1. 在浏览器中打开 http://localhost:5173');
console.log('2. 打开开发者工具（F12）');
console.log('3. 创建房间 + 添加2个AI');
console.log('4. 复制控制台中的所有日志');
console.log('5. 将日志发送给开发者分析');
console.log('\n或者使用以下命令将日志保存到文件：');
console.log('  在浏览器控制台运行: copy(console.log.history)');
