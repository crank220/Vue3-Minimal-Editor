import { describe, expect, it } from 'vitest'
import { sanitizeEditorHtml, sanitizeStyleText } from '../../src/utils/sanitizeHtml'

describe('sanitizeEditorHtml', () => {
  it('keeps the editor schema and removes executable markup', () => {
    const clean = sanitizeEditorHtml(`
      <span
        onclick="window.__xss = 1"
        data-stroke-width="2"
        data-stroke-color="#123456"
        data-stroke-position="outside"
        style="font-size: 30px; color: #ff0000; width: 999px; background: url(javascript:alert(1));"
      >
        Safe<img src=x onerror="window.__xss = 2"><b> text</b>
      </span>
      <script>window.__xss = 3</script>
      <br>
    `)

    const container = document.createElement('div')
    container.innerHTML = clean
    const span = container.querySelector('span')

    expect(container.querySelector('script')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('onerror')
    expect(clean).not.toContain('javascript:')
    expect(span?.textContent).toContain('Safe')
    expect(span?.textContent).toContain('text')
    expect(span?.style.fontSize).toBe('30px')
    expect(span?.style.color).toBe('rgb(255, 0, 0)')
    expect(span?.style.width).toBe('')
    expect(span?.dataset.strokeWidth).toBe('2')
    expect(span?.dataset.strokeColor).toBe('#123456')
    expect(span?.dataset.strokePosition).toBe('outside')
    expect(container.querySelector('br')).not.toBeNull()
  })

  it('drops dangerous style values', () => {
    const style = sanitizeStyleText(`
      color: #000;
      background-image: url(javascript:alert(1));
      text-shadow: 1px 1px 0 #fff;
      position: fixed;
    `)

    const span = document.createElement('span')
    span.setAttribute('style', style)

    expect(span.style.color).toBe('rgb(0, 0, 0)')
    expect(span.style.textShadow).toContain('1px 1px')
    expect(span.style.textShadow).toContain('#fff')
    expect(span.style.backgroundImage).toBe('')
    expect(span.style.position).toBe('')
  })

  it('keeps text-shadow colors with comma and color-first syntax', () => {
    const style = sanitizeStyleText(`
      text-shadow:
        1px 2px 3px rgb(0, 0, 0),
        rgba(255, 0, 0, 0.5) 4px 5px 0;
    `)

    expect(style).toContain('1px 2px 3px rgb(0, 0, 0)')
    expect(style).toContain('4px 5px 0px rgba(255, 0, 0, 0.5)')
  })

  it('clamps expensive text style values from inline html', () => {
    const shadows = Array.from({ length: 200 }, (_, index) => `${index}px ${index}px 0 #000`).join(', ')
    const style = sanitizeStyleText(`
      font-size: 9999px;
      letter-spacing: 999px;
      line-height: 99;
      -webkit-text-stroke-width: 99px;
      text-shadow: ${shadows};
    `)

    expect(style).toContain('font-size: 512px')
    expect(style).toContain('letter-spacing: 30px')
    expect(style).toContain('line-height: 3')
    expect(style).toContain('-webkit-text-stroke-width: 12px')
    expect(style.split('rgb(0, 0, 0)').length - 1).toBeLessThanOrEqual(144)
    expect(style).not.toContain('999')
  })
})
