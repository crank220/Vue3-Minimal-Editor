import { expect, test } from '@playwright/test'

test('sanitizes external html before rendering preview content', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    window.__xss = 0
  })

  await page.locator('textarea').first().fill(`
    <img src=x onerror="window.__xss = 1">
    <span onclick="window.__xss = 2" style="font-size: 32px; color: #ff0000; background: url(javascript:alert(1));">
      Safe preview
    </span>
    <script>window.__xss = 3</script>
  `)

  await expect(page.locator('.preview-page-copy', { hasText: 'Safe preview' }).first()).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__xss)).toBe(0)

  const editorHtml = await page.locator('.editor-content').evaluate((element) => element.innerHTML)
  expect(editorHtml).not.toContain('<img')
  expect(editorHtml).not.toContain('<script')
  expect(editorHtml).not.toContain('onclick')
  expect(editorHtml).not.toContain('javascript:')
})

test('generates png previews through the public screenshot method', async ({ page }) => {
  await page.goto('/')

  await page.getByRole('button', { name: 'Screenshot' }).click()

  await expect(page.locator('.cut-preview-image').first()).toBeVisible()
  await expect(page.locator('.demo-metrics')).toContainText(/PNG [1-9]/)
})

test('exports blurred text shadows to png output', async ({ page }) => {
  await page.goto('/')

  await page.locator('textarea').first().fill(`
    <span style="font-size: 96px; line-height: 1; color: #ffffff; text-shadow: 0 0 18px rgb(255, 0, 0);">H</span>
  `)
  await page.getByRole('button', { name: 'Screenshot' }).click()
  await expect(page.locator('.cut-preview-image').first()).toBeVisible()

  const redGlowPixels = await page.locator('.cut-preview-image').first().evaluate(async (image) => {
    if (!image.complete) {
      await new Promise((resolve) => image.addEventListener('load', resolve, { once: true }))
    }

    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let count = 0

    // 不比对整张 PNG，只统计明显偏红像素，避免字体抗锯齿造成快照抖动。
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index]
      const green = data[index + 1]
      const blue = data[index + 2]
      if (red > green + 30 && red > blue + 30) {
        count += 1
      }
    }

    return count
  })

  expect(redGlowPixels).toBeGreaterThan(20)
})

test('does not leak off-slice blurred shadow source glyphs', async ({ page }) => {
  await page.goto('/')

  const spacer = '&nbsp;'.repeat(90)
  await page.locator('textarea').first().fill(`
    <span style="font-size: 96px; line-height: 1; color: #111111;">A${spacer}</span><span style="font-size: 96px; line-height: 1; color: #ffffff; text-shadow: 0 0 18px rgb(0, 0, 255);">B</span>
  `)
  await page.locator('select').first().selectOption('singleline')
  await page.getByRole('button', { name: 'Screenshot' }).click()
  await expect(page.locator('.cut-preview-image').first()).toBeVisible()

  const blueLeakPixels = await page.locator('.cut-preview-image').first().evaluate(async (image) => {
    if (!image.complete) {
      await new Promise((resolve) => image.addEventListener('load', resolve, { once: true }))
    }

    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    let count = 0

    // 第一张切片不应包含第二个字的蓝色模糊阴影，用像素计数守住跨切片泄漏问题。
    for (let index = 0; index < data.length; index += 4) {
      const red = data[index]
      const green = data[index + 1]
      const blue = data[index + 2]
      if (blue > red + 30 && blue > green + 30) {
        count += 1
      }
    }

    return count
  })

  expect(blueLeakPixels).toBe(0)
})
