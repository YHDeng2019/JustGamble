import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const log = [];
page.on('console', msg => {
  const text = msg.text();
  log.push(text);
  if (text.includes('联机引擎') || text.includes('gameLog') || text.includes('sequence') || text.includes('AI')) {
    console.log('[Browser]', text);
  }
});

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  console.log('=== 步骤1: 用户选择 ===');
  let buttons = await page.locator('button').allTextContents();
  console.log('按钮:', buttons.join(', '));
  
  // 点击下一步或创建用户
  await page.locator('button').first().click();
  await page.waitForTimeout(1000);
  
  // 如果需要输入名字
  const inputs = await page.locator('input').count();
  if (inputs > 0) {
    await page.locator('input').first().fill('TestUser');
    await page.locator('button').filter({ hasText: /确认|下一步|保存/ }).first().click();
    await page.waitForTimeout(1000);
  }
  
  console.log('\n=== 步骤2: 主菜单 ===');
  buttons = await page.locator('button').allTextContents();
  console.log('按钮:', buttons.join(', '));
  
  // 查找并点击联机按钮
  const onlineBtn = page.locator('button').filter({ hasText: /联机/ }).first();
  if (await onlineBtn.count() > 0) {
    console.log('✓ 点击联机按钮');
    await onlineBtn.click();
    await page.waitForTimeout(2000);
    
    console.log('\n=== 步骤3: 联机大厅 ===');
    buttons = await page.locator('button').allTextContents();
    console.log('按钮:', buttons.join(', '));
    
    // 创建房间
    await page.locator('button').filter({ hasText: /创建/ }).first().click();
    await page.waitForTimeout(2000);
    
    console.log('\n=== 步骤4: 等待室 ===');
    buttons = await page.locator('button').allTextContents();
    console.log('按钮:', buttons.join(', '));
    
    // 添加2个AI
    for (let i = 0; i < 2; i++) {
      const addBot = page.locator('button').filter({ hasText: /添加.*机器人|AI/ }).first();
      if (await addBot.count() > 0) {
        await addBot.click();
        console.log(`✓ 添加AI ${i+1}`);
        await page.waitForTimeout(500);
      }
    }
    
    // 开始游戏
    await page.locator('button').filter({ hasText: /开始游戏/ }).first().click();
    await page.waitForTimeout(3000);
    
    console.log('\n=== 步骤5: 游戏中 ===');
    
    // 检查游戏日志
    const logEntries = await page.locator('.log-entry').count();
    console.log(`游戏日志条目数: ${logEntries}`);
    
    // 检查UI元素
    const hasSettings = await page.locator('button').filter({ hasText: /⚙/ }).count() > 0;
    const hasHandHint = await page.locator('.hand-hint').count() > 0;
    console.log(`设置按钮: ${hasSettings}`);
    console.log(`手牌提示: ${hasHandHint}`);
    
    // 等待10秒观察AI行动
    console.log('\n观察AI行动10秒...');
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000);
      
      const state = await page.evaluate(() => {
        if (!window.gameState) return null;
        const cp = window.gameState.players?.[window.gameState.currentPlayerIndex];
        return {
          currentPlayer: cp?.name,
          currentIndex: window.gameState.currentPlayerIndex,
          sequence: window.gameState.sequence,
          hasActed: cp?.hasActed
        };
      });
      
      if (state) {
        console.log(`[${i+1}s] ${state.currentPlayer} (seq=${state.sequence}, acted=${state.hasActed})`);
      }
    }
    
    console.log('\n=== 关键浏览器日志 ===');
    log.filter(l => l.includes('sequence') || l.includes('AI') || l.includes('gameLog')).slice(-20).forEach(l => {
      console.log(l);
    });
    
  } else {
    console.log('❌ 未找到联机按钮');
  }
  
} catch (e) {
  console.error('\n❌ 错误:', e.message);
} finally {
  await browser.close();
}
