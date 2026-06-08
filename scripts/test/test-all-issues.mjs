import { chromium } from 'playwright';

console.log('🎮 联机模式4个问题完整验证\n');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const logs = [];
page.on('console', msg => logs.push(msg.text()));

try {
  await page.goto('http://localhost:5173', { timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // 快速完成用户创建
  await page.click('button');
  await page.fill('input', 'Test');
  for (let i = 0; i < 10; i++) {
    try {
      await page.click('button:has-text("下一步"), button:has-text("完成"), button:has-text("跳过")', { timeout: 1000 });
      await page.waitForTimeout(500);
    } catch { break; }
  }
  
  await page.click('button:has-text("联机")');
  await page.waitForTimeout(2000);
  await page.click('button:has-text("创建房间")');
  await page.waitForTimeout(1000);
  
  const dialogBtns = await page.locator('button').all();
  if (dialogBtns.length > 2) await dialogBtns[dialogBtns.length - 2].click();
  
  await page.waitForTimeout(3000);
  
  // 添加2个AI
  try {
    await page.click('button:has-text("添加")', { timeout: 2000 });
    await page.waitForTimeout(500);
    await page.click('button:has-text("添加")', { timeout: 2000 });
  } catch {}
  
  await page.waitForTimeout(1000);
  
  // 开始游戏
  try {
    await page.click('button:has-text("开始游戏")', { timeout: 2000 });
  } catch {}
  
  await page.waitForTimeout(5000);
  
  console.log('='.repeat(60));
  console.log('验证4个问题');
  console.log('='.repeat(60));
  
  // 问题2: 游戏日志
  console.log('\n📝 问题2: 游戏日志是否显示？');
  const logCount = await page.locator('.log-entry').count();
  console.log(`   日志条目数: ${logCount}`);
  
  if (logCount > 0) {
    const samples = await page.locator('.log-entry').allTextContents();
    console.log(`   ✅ 有内容 (前3条): ${samples.slice(0, 3).map(s => s.trim()).join(', ')}`);
  } else {
    console.log(`   ❌ 日志为空`);
    const debug = await page.evaluate(() => window.gameState?.gameLog);
    console.log(`   gameState.gameLog: ${JSON.stringify(debug)}`);
  }
  
  // 问题1: UI布局
  console.log('\n🎨 问题1: UI布局是否完整？');
  const ui = {
    settings: await page.locator('button:has-text("⚙")').count() > 0,
    handHint: await page.locator('.hand-hint').count() > 0,
    gameLog: await page.locator('.game-log').count() > 0,
    header: await page.locator('.game-header').count() > 0
  };
  console.log(`   设置按钮⚙️: ${ui.settings ? '✅' : '❌'}`);
  console.log(`   手牌提示: ${ui.handHint ? '✅' : '❌'}`);
  console.log(`   游戏日志面板: ${ui.gameLog ? '✅' : '❌'}`);
  console.log(`   游戏头部: ${ui.header ? '✅' : '❌'}`);
  
  // 问题4: 玩家位置
  console.log('\n📍 问题4: 玩家是否在自己视角的底部？');
  const pos = await page.evaluate(() => {
    if (!window.gameState || !window.user) return null;
    const userId = window.user.userId;
    const players = window.gameState.players;
    return {
      userId,
      players: players.map((p, i) => `${i}:${p.name}`),
      myIndex: players.findIndex(p => p.id === userId)
    };
  });
  
  if (pos) {
    console.log(`   玩家顺序: ${pos.players.join(', ')}`);
    console.log(`   我的索引: ${pos.myIndex} ${pos.myIndex === 0 ? '✅ 正确(在底部)' : '❌ 错误(应该是0)'}`);
  }
  
  // 问题3: AI卡住
  console.log('\n🤖 问题3: AI是否会卡住？(观察20秒)');
  const history = [];
  
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(1000);
    
    const state = await page.evaluate(() => {
      if (!window.gameState) return null;
      const cp = window.gameState.players[window.gameState.currentPlayerIndex];
      return {
        seq: window.gameState.sequence,
        player: cp?.name,
        idx: window.gameState.currentPlayerIndex,
        stage: window.gameState.stage
      };
    });
    
    if (state) history.push(state);
  }
  
  if (history.length > 0) {
    console.log(`   起始状态: ${history[0].player} seq=${history[0].seq} stage=${history[0].stage}`);
    console.log(`   结束状态: ${history[history.length-1].player} seq=${history[history.length-1].seq} stage=${history[history.length-1].stage}`);
    
    // 检查是否卡住（同一玩家超过10秒）
    const last = history[history.length - 1];
    const stuckCount = history.filter(h => h.player === last.player && h.seq === last.seq).length;
    const isStuck = stuckCount >= 10;
    
    console.log(`   同状态持续: ${stuckCount}秒 ${isStuck ? '❌ 卡住了' : '✅ 正常'}`);
    
    // 检查sequence是否递增
    const sequences = history.map(h => h.seq);
    const minSeq = Math.min(...sequences);
    const maxSeq = Math.max(...sequences);
    const seqGrew = maxSeq > minSeq;
    
    console.log(`   sequence范围: ${minSeq} → ${maxSeq} ${seqGrew ? '✅ 有递增' : '❌ 未变化'}`);
    
    // 显示sequence变化轨迹
    const uniqueSeqs = [...new Set(sequences)].sort((a,b) => a-b);
    console.log(`   经历的sequence: ${uniqueSeqs.join(' → ')}`);
  }
  
  // 关键日志
  console.log('\n📋 关键浏览器日志:');
  const keyLogs = logs.filter(l => 
    l.includes('sequence') || 
    l.includes('AI') || 
    l.includes('gameLog') ||
    l.includes('卡') ||
    l.includes('错误') ||
    l.includes('失败')
  );
  
  keyLogs.slice(-15).forEach(l => {
    if (l.includes('sequence')) console.log(`   📊 ${l}`);
    else if (l.includes('AI')) console.log(`   🤖 ${l}`);
    else console.log(`   ℹ️  ${l}`);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log('测试完成');
  console.log('='.repeat(60));
  
} catch (e) {
  console.error('\n❌ 测试失败:', e.message);
} finally {
  await browser.close();
}
