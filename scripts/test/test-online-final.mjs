import { chromium } from 'playwright';

console.log('🎮 联机模式测试\n');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const logs = [];
page.on('console', msg => logs.push(msg.text()));

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // 创建用户流程
  await page.locator('button').first().click();
  await page.waitForTimeout(500);
  await page.fill('input', 'TestUser');
  
  // 点击所有"下一步"和"完成"/"跳过"直到进入主菜单
  for (let i = 0; i < 10; i++) {
    const btns = await page.locator('button').allTextContents();
    if (btns.some(b => b.includes('联机') || b.includes('开始游戏') || b.includes('历史'))) {
      console.log('✓ 到达主菜单');
      break;
    }
    
    const nextBtn = page.locator('button').filter({ hasText: /下一步|完成|跳过/ }).first();
    if (await nextBtn.count() > 0) {
      await nextBtn.click();
      await page.waitForTimeout(1000);
    } else {
      break;
    }
  }
  
  // 进入联机模式
  await page.locator('button').filter({ hasText: /联机/ }).click();
  await page.waitForTimeout(2000);
  console.log('✓ 进入联机大厅');
  
  // 创建房间
  await page.locator('button').filter({ hasText: /创建/ }).first().click();
  await page.waitForTimeout(2000);
  console.log('✓ 创建房间');
  
  // 添加2个AI
  for (let i = 0; i < 2; i++) {
    const addBtn = page.locator('button').filter({ hasText: /添加|机器人|AI/ }).first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(500);
    }
  }
  console.log('✓ 添加2个AI');
  
  // 开始游戏
  await page.locator('button').filter({ hasText: /开始/ }).first().click();
  await page.waitForTimeout(4000);
  console.log('✓ 游戏开始\n');
  
  console.log('='.repeat(60));
  console.log('验证4个问题');
  console.log('='.repeat(60));
  
  // 问题2: 游戏日志
  console.log('\n📝 问题2: 游戏日志');
  const logCount = await page.locator('.log-entry').count();
  console.log(`   日志条目: ${logCount} ${logCount > 0 ? '✅' : '❌'}`);
  
  if (logCount === 0) {
    const debug = await page.evaluate(() => ({
      gameLog: window.gameState?.gameLog,
      length: window.gameState?.gameLog?.length
    }));
    console.log(`   gameState.gameLog:`, debug);
  }
  
  // 问题1: UI布局
  console.log('\n🎨 问题1: UI布局');
  const ui = {
    settings: await page.locator('button:has-text("⚙")').count() > 0,
    handHint: await page.locator('.hand-hint').count() > 0,
    gameLog: await page.locator('.game-log').count() > 0,
    header: await page.locator('.game-header').count() > 0
  };
  console.log(`   设置: ${ui.settings ? '✅' : '❌'}`);
  console.log(`   手牌提示: ${ui.handHint ? '✅' : '❌'}`);
  console.log(`   日志组件: ${ui.gameLog ? '✅' : '❌'}`);
  console.log(`   头部: ${ui.header ? '✅' : '❌'}`);
  
  // 问题4: 玩家位置
  console.log('\n📍 问题4: 玩家视角');
  const playerInfo = await page.evaluate(() => {
    if (!window.gameState) return null;
    const userId = window.user?.userId;
    return {
      userId,
      players: window.gameState.players.map((p, i) => `${i}:${p.name}(${p.id})`),
      myIndex: window.gameState.players.findIndex(p => p.id === userId)
    };
  });
  console.log(`   用户ID: ${playerInfo?.userId}`);
  console.log(`   玩家: ${playerInfo?.players}`);
  console.log(`   我的位置: ${playerInfo?.myIndex} ${playerInfo?.myIndex === 0 ? '✅' : '❌'}`);
  
  // 问题3: AI卡住
  console.log('\n🤖 问题3: AI行动(15秒)');
  const history = [];
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => {
      if (!window.gameState) return null;
      const cp = window.gameState.players[window.gameState.currentPlayerIndex];
      return {
        seq: window.gameState.sequence,
        player: cp?.name,
        idx: window.gameState.currentPlayerIndex
      };
    });
    if (s) {
      history.push(s);
      if (i % 3 === 0) console.log(`   [${i+1}s] ${s.player} seq=${s.seq}`);
    }
  }
  
  const stuck = history.slice(-8).every(s => s.player === history[history.length-1].player);
  console.log(`   是否卡住: ${stuck ? '❌ 是' : '✅ 否'}`);
  
  const seqs = history.map(s => s.seq);
  console.log(`   sequence: ${Math.min(...seqs)}→${Math.max(...seqs)} ${Math.max(...seqs) > Math.min(...seqs) ? '✅' : '❌'}`);
  
  console.log('\n📋 关键日志:');
  logs.filter(l => l.includes('AI') || l.includes('sequence') || l.includes('gameLog'))
    .slice(-10).forEach(l => console.log('   ' + l));
  
  console.log('\n' + '='.repeat(60));
  
} catch (e) {
  console.error('❌ 错误:', e.message);
} finally {
  await browser.close();
}
