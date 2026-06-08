import { chromium } from 'playwright';

console.log('🎮 启动联机模式诊断测试...\n');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 10000 });
  await page.waitForTimeout(2000);

  // 获取页面文本内容
  const bodyText = await page.locator('body').textContent();
  console.log('📄 页面文本内容:');
  console.log(bodyText.substring(0, 500));
  console.log('...\n');

  // 获取所有按钮
  const buttons = await page.locator('button').allTextContents();
  console.log('🔘 页面上的所有按钮:');
  buttons.forEach((btn, i) => console.log(`  ${i+1}. ${btn}`));
  console.log('');

  // 检查是否在用户选择界面
  const hasUserCard = await page.locator('.user-card').count() > 0;
  const hasCreateUser = await page.locator('button').filter({ hasText: /创建|新建/ }).count() > 0;

  console.log(`是否有用户卡片: ${hasUserCard}`);
  console.log(`是否有创建用户按钮: ${hasCreateUser}\n`);

  // 尝试选择或创建用户
  if (hasUserCard) {
    console.log('✓ 选择第一个用户');
    await page.locator('.user-card').first().click();
    await page.waitForTimeout(1000);
  } else if (hasCreateUser) {
    console.log('✓ 创建新用户');
    await page.locator('button').filter({ hasText: /创建|新建/ }).first().click();
    await page.waitForTimeout(500);

    // 填写用户名
    const nameInput = await page.locator('input[type="text"], input[placeholder*="名"]').first();
    if (await nameInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await nameInput.fill('AutoTestUser');
      await page.locator('button').filter({ hasText: /确认|保存|完成/ }).first().click();
      await page.waitForTimeout(1000);
    }
  }

  // 再次获取按钮列表
  const buttonsAfter = await page.locator('button').allTextContents();
  console.log('\n🔘 登录后的按钮:');
  buttonsAfter.forEach((btn, i) => console.log(`  ${i+1}. ${btn}`));

  // 查找联机按钮
  const onlineButtons = await page.locator('button').filter({ hasText: /联机|在线/ }).count();
  console.log(`\n找到 ${onlineButtons} 个联机相关按钮\n`);

  if (onlineButtons > 0) {
    console.log('✓ 点击联机按钮');
    await page.locator('button').filter({ hasText: /联机/ }).first().click();
    await page.waitForTimeout(2000);

    // 检查是否进入联机大厅
    const pageTextAfter = await page.locator('body').textContent();
    console.log('📄 联机大厅内容:');
    console.log(pageTextAfter.substring(0, 300));
  } else {
    console.log('❌ 未找到联机按钮');
    console.log('当前页面可能是:', await page.title());
  }

  await page.screenshot({ path: '/tmp/final-state.png' });
  console.log('\n✓ 截图: /tmp/final-state.png');

} catch (error) {
  console.error('\n❌ 错误:', error.message);
  await page.screenshot({ path: '/tmp/error-state.png' });
} finally {
  await browser.close();
}
