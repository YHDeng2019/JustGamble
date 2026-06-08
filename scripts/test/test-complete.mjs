import { chromium } from 'playwright';

console.log('🎮 联机模式完整测试\n');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const logs = [];
page.on('console', msg => logs.push(msg.text()));

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // 用户创建
  await page.locator('button').first().click();
  await page.waitForTimeout(500);
  await page.fill('input', 'TestUser');
  
  for (let i = 0; i < 10; i++) {
    const btns = await page.locator('button').allTextContents();
    if (btns.some(b => b.includes('联机'))) break;
    await page.locator('button').filter({ hasText: /下一步|完成|跳过/ }).first().click();
    await page.waitForTimeout(1000);
  }
  
  // 进入联机
  await page.locator('button').filter({ hasText: /联机/ }).click();
  await page.waitForTimeout(2000);
  console.log('✓ 进入联机大厅');
  
  // 点击"创建房间"打开对话框
  await page.locator('button').filter({ hasText: /创建房间/ }).first().click();
  await page.waitForTimeout(1000);
  
  // 在对话框中再次点击"创建房间"确认
  await page.locator('button').filter({ hasText: /创建房间/ }).nth(1).click();
  await page.waitForTimeout(3000);
  console.log('✓ 房间已创建');
  
  // 现在应该在等待室了，添加AI
  for (let i = 0; i < 2; i++) {
    const addBtn = page.locator('button').filter({ hasText: /添加|AI|机器人/ }).first();
    const count = await addBtn.count();
    if (count > 0) {
      await addBtn.click();
      await page.waitForTimeout(800);
      console.log(`✓ 添加AI ${i+1}`);
    }
  }
  
  // 开始游戏
  const startBtn = page.locator('button').filter({ hasText: /开始游戏/ }).first();
  if (await startBtn.count() > 0) {
    await startBtn.click();
    await page.waitForTimeout(5000);
    console.log('✓ 游戏开始\n');
  } else {
    console.log('⚠️  未找到开始游戏按钮');
    const btns = await page.locator('button').allTextContents();
    console.log('   当前按钮:', btns);
  }
  
  console.log('='.repeat(60));
  console.log('验证4个问题');
  console.log('='.repeat(60));
  
  // 问题2: 游戏日志
  console.log('\n📝 问题2: 游戏日志');
  const logCount = await page.locator('.log-entry').count();
  console.log(`   条目数: ${logCount}`);
  
  if (logCount > 0) {
    const first = await page.locator('.log-entry').first().textContent();
    console.log(`   ✅ 有内容: ${first.substring(0, 50)}`);
  } else {
    console.log(`   ❌ 日志为空`);
    const debug = await page.evaluate(() => ({
      gameLog: window.gameState?.gameLog,
      length: window.gameState?.gameLog?.length
    }));
    console.log(`   调试:`, JSON.stringify(debug));
  }
  
  // 问题1: UI
  console.log('\n🎨 问题1: UI布局');
  const ui = {
    settings: await page.locator('button:has-text("⚙")').count(),
    handHint: await page.locator('.hand-hint').count(),
    gameLog: await page.locator('.game-log').count()
  };
  console.log(`   设置按钮: ${ui.settings > 0 ? '✅' : '❌'}`);
  console.log(`   手牌提示: ${ui.handHint > 0 ? '✅' : '❌'}`);
  console.log(`   日志组件: ${ui.gameLog > 0 ? '✅' : '❌'}`);
  
  // 问题4: 玩家位置
  console.log('\n📍 问题4: 玩家位置');
  const pos = await page.evaluate(() => {
    if (!window.gameState || !window.user) return null;
    const userId = window.user.userId;
    const players = window.gameState.players;
    return {
      userId,
      players: players.map(p => p.name),
      myIndex: players.findIndex(p => p.id === userId)
    };
  });
  if (pos) {
    console.log(`   玩家: [${pos.players.join(', ')}]`);
    console.log(`   我的位置: ${pos.myIndex} ${pos.myIndex === 0 ? '✅' : '❌ 应该是0'}`);
  }
  
  // 问题3: AI卡住(15秒)
  console.log('\n🤖 问题3: AI行动');
  const hist = [];
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => {
      const gs = window.gameState;
      if (!gs) return null;
      const cp = gs.players[gs.currentPlayerIndex];
      return { seq: gs.sequence, player: cp?.name, idx: gs.currentPlayerIndex };
    });
    if (s) hist.push(s);
  }
  
  if (hist.length > 0) {
    console.log(`   起始: ${hist[0].player} seq=${hist[0].seq}`);
    console.log(`   结束: ${hist[hist.length-1].player} seq=${hist[hist.length-1].seq}`);
    
    const stuck = hist.slice(-8).every(h => h.player === hist[hist.length-1].player);
    const seqGrew = hist[hist.length-1].seq > hist[0].seq;
    
    console.log(`   卡住: ${stuck ? '❌ 是' : '✅ 否'}`);
    console.log(`   sequence递增: ${seqGrew ? '✅' : '❌'}`);
  }
  
  console.log('\n📋 关键日志(最后10条):');
  logs.filter(l => l.includes('联机引擎') || l.includes('AI') || l.includes('sequence'))
    .slice(-10).forEach(l => console.log('   ' + l));
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ 测试完成');
  
} catch (e) {
  console.error('\n❌ 错误:', e.message);
  await page.screenshot({ path: '/tmp/error.png' });
} finally {
  await browser.close();
}
