import { chromium } from 'playwright';

console.log('🎮 启动联机模式测试...\n');

const browser = await chromium.launch({
  headless: false,
  args: ['--window-size=1280,800']
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 800 }
});

const page = await context.newPage();

// 监听控制台消息
const consoleLogs = [];
page.on('console', msg => {
  const text = msg.text();
  consoleLogs.push(text);
  console.log(`[Browser Console] ${text}`);
});

// 监听错误
page.on('pageerror', error => {
  console.error(`[Page Error] ${error.message}`);
});

try {
  console.log('📡 访问 http://localhost:5173');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // 截图：初始页面
  await page.screenshot({ path: '/tmp/screenshot-01-initial.png' });
  console.log('✓ 截图保存: /tmp/screenshot-01-initial.png');

  // 选择用户（如果有）
  const selectUserButton = await page.locator('button').filter({ hasText: /选择|创建/ }).first();
  if (await selectUserButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('🧑 检测到用户选择界面');
    // 尝试选择第一个用户或创建新用户
    const userCards = await page.locator('.user-card').count();
    if (userCards > 0) {
      await page.locator('.user-card').first().click();
      console.log('✓ 选择了第一个用户');
    } else {
      // 创建新用户
      const createBtn = await page.locator('button').filter({ hasText: /创建/ }).first();
      if (await createBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await createBtn.click();
        await page.fill('input[type="text"]', 'TestUser');
        await page.locator('button').filter({ hasText: /确认|保存/ }).click();
        console.log('✓ 创建了新用户 TestUser');
      }
    }
    await page.waitForTimeout(1000);
  }

  // 进入联机模式
  console.log('\n🌐 点击"联机模式"按钮');
  const onlineButton = await page.locator('button').filter({ hasText: /联机/ }).first();
  await onlineButton.click();
  await page.waitForTimeout(2000);

  // 截图：联机大厅
  await page.screenshot({ path: '/tmp/screenshot-02-lobby.png' });
  console.log('✓ 截图保存: /tmp/screenshot-02-lobby.png');

  // 创建房间
  console.log('\n🏠 创建房间');
  const createRoomBtn = await page.locator('button').filter({ hasText: /创建房间/ }).first();
  await createRoomBtn.click();
  await page.waitForTimeout(1000);

  // 填写房间设置（如果有）
  const startGameBtn = await page.locator('button').filter({ hasText: /开始游戏|确认/ });
  if (await startGameBtn.count() > 0) {
    await startGameBtn.first().click();
  }
  await page.waitForTimeout(2000);

  // 截图：等待室
  await page.screenshot({ path: '/tmp/screenshot-03-waiting-room.png' });
  console.log('✓ 截图保存: /tmp/screenshot-03-waiting-room.png');

  // 添加AI机器人
  console.log('\n🤖 添加2个AI机器人');
  const addBotBtn = await page.locator('button').filter({ hasText: /添加.*机器人|加入AI/ }).first();

  for (let i = 0; i < 2; i++) {
    if (await addBotBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await addBotBtn.click();
      console.log(`✓ 添加了第 ${i + 1} 个AI`);
      await page.waitForTimeout(500);
    }
  }

  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screenshot-04-with-bots.png' });
  console.log('✓ 截图保存: /tmp/screenshot-04-with-bots.png');

  // 开始游戏
  console.log('\n▶️  开始游戏');
  const startBtn = await page.locator('button').filter({ hasText: /开始游戏/ }).first();
  await startBtn.click();
  await page.waitForTimeout(3000);

  // 截图：游戏开始
  await page.screenshot({ path: '/tmp/screenshot-05-game-start.png', fullPage: true });
  console.log('✓ 截图保存: /tmp/screenshot-05-game-start.png');

  // ===== 验证问题 =====
  console.log('\n' + '='.repeat(60));
  console.log('🔍 开始验证问题...');
  console.log('='.repeat(60));

  // 问题2：游戏日志
  console.log('\n📝 问题2：检查游戏日志是否有内容');
  const gameLogElement = await page.locator('.game-log, .log-content').first();
  const logEntries = await page.locator('.log-entry').count();
  console.log(`   日志条目数: ${logEntries}`);

  if (logEntries > 0) {
    console.log('   ✅ 游戏日志有内容');
    const firstLog = await page.locator('.log-entry').first().textContent();
    console.log(`   首条日志: ${firstLog}`);
  } else {
    console.log('   ❌ 游戏日志为空');
  }

  // 问题1：UI布局
  console.log('\n🎨 问题1：检查UI布局元素');
  const hasSettingsBtn = await page.locator('button').filter({ hasText: /⚙️/ }).count() > 0;
  const hasHandHint = await page.locator('.hand-hint').count() > 0;
  const hasGameHeader = await page.locator('.game-header').count() > 0;

  console.log(`   设置按钮: ${hasSettingsBtn ? '✅' : '❌'}`);
  console.log(`   手牌提示: ${hasHandHint ? '✅' : '❌'}`);
  console.log(`   游戏头部: ${hasGameHeader ? '✅' : '❌'}`);

  // 问题4：玩家位置
  console.log('\n📍 问题4：检查玩家视角定位');

  // 在控制台执行JavaScript获取玩家信息
  const playerInfo = await page.evaluate(() => {
    const gameState = window.gameState;
    const user = window.user;
    if (!gameState || !gameState.players) {
      return { error: 'gameState不可用' };
    }

    return {
      players: gameState.players.map((p, i) => ({
        index: i,
        name: p.name,
        id: p.id,
        isHuman: p.isHuman
      })),
      currentUserId: user?.userId,
      totalPlayers: gameState.players.length
    };
  });

  console.log('   玩家信息:', JSON.stringify(playerInfo, null, 2));

  // 问题3：等待AI行动，观察是否卡住
  console.log('\n🤖 问题3：观察AI行动（等待10秒）');

  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);

    // 检查当前玩家
    const currentPlayerInfo = await page.evaluate(() => {
      const gs = window.gameState;
      if (!gs || !gs.players) return null;
      const cp = gs.players[gs.currentPlayerIndex];
      return {
        index: gs.currentPlayerIndex,
        name: cp?.name,
        isHuman: cp?.isHuman,
        hasActed: cp?.hasActed,
        sequence: gs.sequence
      };
    });

    if (currentPlayerInfo) {
      console.log(`   [${i+1}s] 当前玩家: ${currentPlayerInfo.name} (index=${currentPlayerInfo.index}, seq=${currentPlayerInfo.sequence})`);
    }
  }

  // 最终截图
  await page.screenshot({ path: '/tmp/screenshot-06-after-10s.png', fullPage: true });
  console.log('\n✓ 最终截图: /tmp/screenshot-06-after-10s.png');

  // 获取所有控制台日志中的关键信息
  console.log('\n📋 控制台关键日志:');
  const aiLogs = consoleLogs.filter(log =>
    log.includes('AI') ||
    log.includes('sequence') ||
    log.includes('卡住') ||
    log.includes('错误') ||
    log.includes('失败')
  );

  aiLogs.slice(-20).forEach(log => {
    console.log(`   ${log}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('✅ 测试完成');
  console.log('='.repeat(60));
  console.log('\n📸 截图已保存到 /tmp/screenshot-*.png');
  console.log('请检查截图以验证UI和游戏状态\n');

} catch (error) {
  console.error('\n❌ 测试失败:', error.message);
  await page.screenshot({ path: '/tmp/screenshot-error.png' });
  console.log('错误截图: /tmp/screenshot-error.png');
} finally {
  await browser.close();
}
