import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  console.log('访问页面...');
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  console.log('\n页面标题:', await page.title());
  
  const buttons = await page.locator('button').allTextContents();
  console.log('\n找到的按钮:', buttons.length);
  buttons.forEach(btn => console.log('  -', btn.trim()));
  
  const hasOnlineBtn = buttons.some(b => b.includes('联机'));
  console.log('\n有联机按钮?', hasOnlineBtn);
  
} catch (e) {
  console.error('错误:', e.message);
} finally {
  await browser.close();
}
