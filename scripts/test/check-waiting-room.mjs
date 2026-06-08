import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // 快速通过用户创建
  await page.locator('button').first().click();
  await page.waitForTimeout(500);
  await page.fill('input', 'TestUser');
  
  for (let i = 0; i < 10; i++) {
    const btns = await page.locator('button').allTextContents();
    if (btns.some(b => b.includes('联机'))) break;
    await page.locator('button').filter({ hasText: /下一步|完成|跳过/ }).first().click();
    await page.waitForTimeout(1000);
  }
  
  await page.locator('button').filter({ hasText: /联机/ }).click();
  await page.waitForTimeout(2000);
  
  await page.locator('button').filter({ hasText: /创建/ }).first().click();
  await page.waitForTimeout(2000);
  
  // 添加AI
  for (let i = 0; i < 2; i++) {
    const addBtn = page.locator('button').filter({ hasText: /添加|机器人|AI/ }).first();
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(500);
    }
  }
  
  console.log('等待室状态:');
  const text = await page.locator('body').textContent();
  console.log(text.substring(0, 500));
  
  console.log('\n所有按钮:');
  const buttons = await page.locator('button').allTextContents();
  buttons.forEach(b => console.log('  -', b.trim()));
  
  await page.screenshot({ path: '/tmp/waiting-room.png', fullPage: true });
  console.log('\n截图: /tmp/waiting-room.png');
  
} catch (e) {
  console.error('错误:', e.message);
} finally {
  await browser.close();
}
