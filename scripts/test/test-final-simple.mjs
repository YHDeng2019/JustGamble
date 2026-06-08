import { chromium } from 'playwright';

console.log('🎮 联机模式测试\n');

const browser = await chromium.launch({ headless: false, slowMo: 100 });
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
  
  // 进入联机
  await page.click('button:has-text("联机")');
  await page.waitForTimeout(2000);
  
  // 创建房间 - 点击第一个创建按钮
  await page.click('button:has-text("创建房间")');
  await page.waitForTimeout(1000);
  
  // 对话框中确认 - 点击最后一个按钮（通常是确认）
  const dialogButtons = await page.locator('.modal button, .dialog button, button').all();
  if (dialogButtons.length > 0) {
    await dialogButtons[dialogButtons.length - 2].click(); // 倒数第二个通常是确认
  }
  
  await page.waitForTimeout(3000);
  console.log('✓ 进入等待室');
  
  // 简单等待并观察
  console.log('\n等待30秒观察...\n');
  
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    
    if (i === 5) {
      // 尝试添加AI
      try {
        await page.click('button:has-text("添加")', { timeout: 2000 });
        await page.waitForTimeout(500);
        await page.click('button:has-text("添加")', { timeout: 2000 });
      } catch {}
    }
    
    if (i === 10) {
      // 尝试开始游戏
      try {
        await page.click('button:has-text("开始游戏")', { timeout: 2000 });
        console.log('✓ 游戏开始');
      } catch {}
    }
    
    if (i >= 15) {
      // 检查游戏状态
      const state = await page.evaluate(() => {
        if (!window.gameState) return null;
        const cp = window.gameState.players?.[window.gameState.currentPlayerIndex];
        return {
          seq: window.gameState.sequence,
          player: cp?.name,
          logLen: window.gameState.gameLog?.length
        };
      }).catch(() => null);
      
      if (state) {
        console.log(`[${i}s] ${state.player} seq=${state.seq} logs=${state.logLen}`);
      }
    }
  }
  
  console.log('\n测试完成');
  console.log('关键日志:', logs.filter(l => l.includes('AI') || l.includes('sequence')).slice(-5));
  
} catch (e) {
  console.error('错误:', e.message);
} finally {
  await browser.close();
}
