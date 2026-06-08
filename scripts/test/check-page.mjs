import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // 点击第一个按钮
  await page.locator('button').first().click();
  await page.waitForTimeout(1000);
  
  // 获取完整页面文本
  const text = await page.locator('body').textContent();
  console.log('页面内容:');
  console.log(text.substring(0, 1000));
  
  // 获取输入框
  const inputs = await page.locator('input').all();
  console.log('\n输入框数量:', inputs.length);
  
  for (let i = 0; i < inputs.length; i++) {
    const placeholder = await inputs[i].getAttribute('placeholder');
    const type = await inputs[i].getAttribute('type');
    console.log(`  输入框${i+1}: type=${type}, placeholder=${placeholder}`);
  }
  
  // 截图
  await page.screenshot({ path: '/tmp/current-page.png', fullPage: true });
  console.log('\n截图: /tmp/current-page.png');
  
} catch (e) {
  console.error('错误:', e.message);
} finally {
  await browser.close();
}
