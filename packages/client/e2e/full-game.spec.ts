import { test, expect } from '@playwright/test'

const CLIENT = 'http://localhost:5173'

test.describe('Game E2E Smoke', () => {
  test.setTimeout(60000)

  test('创建房间 → 加入 → 准备 → 开局', async ({ browser }) => {
    const ctx1 = await browser.newContext()
    const ctx2 = await browser.newContext()
    const p1 = await ctx1.newPage()
    const p2 = await ctx2.newPage()

    // ── P1: 创建房间 ──
    await p1.goto(CLIENT)
    await expect(p1.locator('h1')).toHaveText('79523')
    await p1.fill('input[placeholder="输入昵称"]', 'T1')
    await p1.click('button:has-text("2人")')
    await p1.click('button:has-text("创建房间")')

    // 房间码显示
    await expect(p1.locator('.code-text')).toBeVisible({ timeout: 5000 })
    const code = (await p1.locator('.code-text').textContent())?.trim()
    expect(code).toMatch(/^[A-Z0-9]{6}$/)
    console.log(`  Room: ${code}`)

    // ── P2: 加入房间 ──
    await p2.goto(CLIENT)
    await p2.locator('input[placeholder="输入昵称"]').last().fill('T2')
    await p2.fill('input[placeholder="输入6位房间码"]', code!)
    await p2.click('button:has-text("加入房间")')

    // 双方看到彼此
    await expect(p1.locator('.player-item')).toHaveCount(2, { timeout: 5000 })
    await expect(p2.locator('.player-item')).toHaveCount(2, { timeout: 5000 })
    console.log('  ✓ 双方在房间')

    // ── 准备 ──
    await p1.locator('button:has-text("准备")').click()
    await p2.locator('button:has-text("准备")').click()
    console.log('  ✓ 双方已准备')

    // ── 开局 ──
    await p1.waitForSelector('.hand-area', { timeout: 10000 })
    await p2.waitForSelector('.hand-area', { timeout: 10000 })
    console.log('  ✓ 游戏开始')

    // 关键元素验证
    await expect(p1.locator('.hand-area .card').first()).toBeVisible()
    await expect(p1.locator('.table-center')).toBeVisible()
    // 至少一人看到"你的回合"或"等待"
    const turnText = await p1.locator('.turn-label').textContent()
    expect(turnText).toMatch(/你的回合|等待/)
    console.log(`  Turn: ${turnText}`)

    // 出牌按钮存在
    await expect(p1.locator('button:has-text("出牌")')).toBeVisible()
    await expect(p1.locator('button:has-text("过")')).toBeVisible()
    console.log('  ✓ 出牌/过按钮可见')

    // ── 模拟一次点击出牌 ──
    const card = p1.locator('.hand-area .card').first()
    await card.click()
    await p1.waitForTimeout(200)

    // 尝试出牌（可能成功也可能牌型/大小不合法）
    const playBtn = p1.locator('button:has-text("出牌"):not([disabled])')
    const passBtn = p1.locator('button:has-text("过"):not([disabled])')
    const canPlay = await playBtn.isVisible({ timeout: 500 }).catch(() => false)
    const canPass = await passBtn.isVisible({ timeout: 500 }).catch(() => false)

    if (canPlay) {
      await playBtn.click()
      console.log('  ✓ 成功出牌')
    } else if (canPass) {
      // 不能出牌则取消选择
      await card.click()
      console.log('  (无法出牌，已取消选择)')
    }

    await p1.waitForTimeout(500)

    // ── 清理 ──
    await ctx1.close()
    await ctx2.close()
    console.log('  ✓ E2E 冒烟测试通过')
  })
})
