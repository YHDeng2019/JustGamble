import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const logs = [];
page.on('console', msg => logs.push(msg.text()));

try {
  await page.goto('http://localhost:5173', { timeout: 30000 });
  await page.waitForTimeout(2000);
  
  await page.click('button');
  await page.fill('input', 'Fiona');
  for (let i = 0; i < 10; i++) {
    try { await page.click('button:has-text("下一步"), button:has-text("完成"), button:has-text("跳过")', { timeout: 1000 }); await page.waitForTimeout(500); } catch { break; }
  }
  
  await page.click('button:has-text("联机")');
  await page.waitForTimeout(2000);
  await page.click('button:has-text("创建房间")');
  await page.waitForTimeout(1000);
  
  const btns = await page.locator('button').all();
  if (btns.length > 2) await btns[btns.length - 2].click();
  await page.waitForTimeout(3000);
  
  try {
    await page.click('button:has-text("添加")', { timeout: 2000 });
    await page.waitForTimeout(500);
    await page.click('button:has-text("添加")', { timeout: 2000 });
    await page.waitForTimeout(1000);
    await page.click('button:has-text("开始游戏")', { timeout: 2000 });
  } catch {}
  
  await page.waitForTimeout(5000);
  
  console.log('\n🔍 最终验证报告\n' + '='.repeat(60));
  
  // 问题4
  const playerPos = await page.evaluate(() => {
    if (!window.gameState || !window.user) return null;
    return {
      userId: window.user.userId,
      players: window.gameState.players.map((p, i) => ({ idx: i, id: p.id, name: p.name })),
      myIndex: window.gameState.players.findIndex(p => p.id === window.user.userId)
    };
  });
  
  console.log('\n📍 问题4: 玩家视角定位');
  if (playerPos) {
    console.log(`用户ID: ${playerPos.userId}`);
    playerPos.players.forEach(p => console.log(`  [${p.idx}] ${p.name} (ID: ${p.id})`));
    console.log(`我的位置: 索引${playerPos.myIndex} ${playerPos.myIndex === 0 ? '✅ 正确' : '❌ 错误'}`);
  } else {
    console.log('❌ 无法获取玩家信息');
  }
  
  // 问题3 - 长时间观察
  console.log('\n🤖 问题3: AI行动观察(30秒)');
  const hist = [];
  
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => {
      if (!window.gameState) return null;
      const cp = window.gameState.players[window.gameState.currentPlayerIndex];
      return { seq: window.gameState.sequence, player: cp?.name, idx: window.gameState.currentPlayerIndex, stage: window.gameState.stage };
    });
    if (s) {
      hist.push(s);
      if (i % 5 === 0 || s.seq !== hist[hist.length - 2]?.seq) {
        console.log(`  [${i}s] ${s.player} seq=${s.seq} stage=${s.stage}`);
      }
    }
  }
  
  if (hist.length > 5) {
    const first = hist[0];
    const last = hist[hist.length - 1];
    const stuckTime = hist.filter(h => h.seq === last.seq && h.player === last.player).length;
    
    console.log(`\n结果:`);
    console.log(`  起始: ${first.player} seq=${first.seq}`);
    console.log(`  结束: ${last.player} seq=${last.seq}`);
    console.log(`  sequence增长: ${first.seq} → ${last.seq} (增加${last.seq - first.seq})`);
    console.log(`  最终状态持续: ${stuckTime}秒`);
    console.log(`  ${stuckTime >= 15 ? '❌ 可能卡住' : '✅ 运行正常'}`);
  }
  
  // 问题1&2总结
  console.log('\n📊 问题1&2: UI和日志');
  const summary = await page.evaluate(() => ({
    logs: window.gameState?.gameLog?.length || 0,
    hasSettings: !!document.querySelector('button:has-text("⚙")'),
    hasHint: !!document.querySelector('.hand-hint')
  }));
  console.log(`  游戏日志: ${summary.logs}条 ${summary.logs > 0 ? '✅' : '❌'}`);
  console.log(`  设置按钮: ${summary.hasSettings ? '✅' : '❌'}`);
  console.log(`  手牌提示: ${summary.hasHint ? '✅' : '❌'}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ 验证完成');
  
} catch (e) {
  console.error('错误:', e.message);
} finally {
  await browser.close();
}
