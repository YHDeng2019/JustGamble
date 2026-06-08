import { chromium } from 'playwright';

console.log('🎮 联机模式完整测试\n');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const consoleLogs = [];
page.on('console', msg => {
  const text = msg.text();
  consoleLogs.push(text);
});

try {
  // === 用户创建 ===
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  console.log('步骤1: 创建用户');
  await page.locator('button').first().click();
  await page.waitForTimeout(500);
  await page.fill('input[type="text"]', 'TestUser');
  await page.locator('button').filter({ hasText: /下一步/ }).click();
  await page.waitForTimeout(2000);
  
  // === 选择头像和风格 ===
  console.log('步骤2: 选择配置');
  // 点击所有的"下一步"直到到达主菜单
  for (let i = 0; i < 5; i++) {
    const nextBtn = page.locator('button').filter({ hasText: /下一步/ });
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
      await page.waitForTimeout(1000);
    } else {
      break;
    }
  }
  
  // === 主菜单 ===
  console.log('步骤3: 主菜单');
  await page.waitForTimeout(1000);
  const buttons = await page.locator('button').allTextContents();
  console.log('菜单按钮:', buttons.filter(b => b.trim()).join(', '));
  
  const onlineBtn = page.locator('button').filter({ hasText: /联机/ });
  if (await onlineBtn.count() === 0) {
    console.log('❌ 未找到联机按钮，当前页面按钮:', buttons);
    throw new Error('找不到联机按钮');
  }
  
  await onlineBtn.click();
  await page.waitForTimeout(2000);
  
  // === 创建房间 ===
  console.log('步骤4: 创建房间');
  await page.locator('button').filter({ hasText: /创建/ }).first().click();
  await page.waitForTimeout(2000);
  
  // === 添加AI ===
  console.log('步骤5: 添加2个AI');
  for (let i = 0; i < 2; i++) {
    const addBtn = page.locator('button').filter({ hasText: /添加.*机器人|加入AI/ }).first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(500);
    }
  }
  
  // === 开始游戏 ===
  console.log('步骤6: 开始游戏');
  await page.locator('button').filter({ hasText: /开始/ }).first().click();
  await page.waitForTimeout(4000);
  
  console.log('\n' + '='.repeat(60));
  console.log('开始验证4个问题');
  console.log('='.repeat(60));
  
  // === 问题2: 游戏日志 ===
  console.log('\n📝 问题2: 游戏日志是否有内容？');
  const logEntries = await page.locator('.log-entry').count();
  console.log(`   日志条目数: ${logEntries}`);
  
  if (logEntries > 0) {
    const firstLog = await page.locator('.log-entry').first().textContent();
    console.log(`   ✅ 有内容，首条: ${firstLog.trim()}`);
  } else {
    console.log('   ❌ 日志为空');
    
    // 调试：检查gameState.gameLog
    const gameLogDebug = await page.evaluate(() => {
      return {
        exists: !!window.gameState,
        gameLog: window.gameState?.gameLog,
        logLength: window.gameState?.gameLog?.length
      };
    });
    console.log('   调试信息:', gameLogDebug);
  }
  
  // === 问题1: UI布局 ===
  console.log('\n🎨 问题1: UI布局是否完整？');
  const hasSettings = await page.locator('button').filter({ hasText: /⚙/ }).count() > 0;
  const hasHandHint = await page.locator('.hand-hint').count() > 0;
  const hasGameLog = await page.locator('.game-log').count() > 0;
  const hasGameHeader = await page.locator('.game-header').count() > 0;
  
  console.log(`   设置按钮: ${hasSettings ? '✅' : '❌'}`);
  console.log(`   手牌提示: ${hasHandHint ? '✅' : '❌'}`);
  console.log(`   游戏日志: ${hasGameLog ? '✅' : '❌'}`);
  console.log(`   游戏头部: ${hasGameHeader ? '✅' : '❌'}`);
  
  // === 问题4: 玩家位置 ===
  console.log('\n📍 问题4: 玩家视角定位是否正确？');
  const playerDebug = await page.evaluate(() => {
    if (!window.gameState || !window.user) return null;
    return {
      userId: window.user.userId,
      players: window.gameState.players.map((p, i) => ({
        index: i,
        id: p.id,
        name: p.name
      })),
      userSettings: window.userSettings
    };
  });
  
  if (playerDebug) {
    console.log(`   当前用户ID: ${playerDebug.userId}`);
    console.log(`   玩家列表:`, playerDebug.players);
    const myIndex = playerDebug.players.findIndex(p => p.id === playerDebug.userId);
    console.log(`   我在索引: ${myIndex} ${myIndex === 0 ? '✅' : '❌ 应该是0'}`);
  }
  
  // === 问题3: AI卡住 ===
  console.log('\n🤖 问题3: AI是否会卡住？(观察15秒)');
  
  const stateHistory = [];
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    
    const state = await page.evaluate(() => {
      if (!window.gameState || !window.engineRef?.current) return null;
      const cp = window.gameState.players?.[window.gameState.currentPlayerIndex];
      return {
        seq: window.gameState.sequence,
        idx: window.gameState.currentPlayerIndex,
        player: cp?.name,
        hasActed: cp?.hasActed,
        aiPending: window.engineRef.current?.aiDecisionPending
      };
    });
    
    if (state) {
      stateHistory.push(state);
      console.log(`   [${i+1}s] seq=${state.seq} ${state.player} (idx=${state.idx}, acted=${state.hasActed}, aiLock=${state.aiPending})`);
    }
  }
  
  // 分析是否卡住
  const lastState = stateHistory[stateHistory.length - 1];
  const samePlayerCount = stateHistory.filter(s => s.player === lastState?.player).length;
  
  if (samePlayerCount >= 10) {
    console.log(`   ❌ 可能卡住了！同一玩家持续${samePlayerCount}秒`);
  } else {
    console.log(`   ✅ AI正常行动，未卡住`);
  }
  
  // 检查sequence是否递增
  const sequences = stateHistory.map(s => s.seq).filter(Boolean);
  const seqIncreasing = sequences.every((s, i) => i === 0 || s >= sequences[i-1]);
  console.log(`   sequence递增: ${seqIncreasing ? '✅' : '❌'}`);
  console.log(`   sequence范围: ${Math.min(...sequences)} - ${Math.max(...sequences)}`);
  
  // === 关键日志 ===
  console.log('\n📋 关键浏览器日志:');
  const keyLogs = consoleLogs.filter(l => 
    l.includes('sequence') || 
    l.includes('AI') || 
    l.includes('gameLog') ||
    l.includes('卡') ||
    l.includes('错误')
  );
  keyLogs.slice(-15).forEach(l => console.log('   ' + l));
  
  console.log('\n' + '='.repeat(60));
  console.log('测试完成');
  console.log('='.repeat(60));
  
} catch (e) {
  console.error('\n❌ 测试失败:', e.message);
  await page.screenshot({ path: '/tmp/test-error.png' });
} finally {
  await browser.close();
}
