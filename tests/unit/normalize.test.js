import { describe, expect, it } from 'vitest'
import { normalize } from '../../src/utils/normalize'

describe('normalize', () => {
  it('merges adjacent spans with equivalent styles and removes empty spans', () => {
    const root = document.createElement('div')
    root.innerHTML = [
      '<span style="color: red;">A</span>',
      '<span style="color: red;">B</span>',
      '<span>   </span>',
    ].join('')

    normalize(root)

    const spans = root.querySelectorAll('span')
    expect(spans).toHaveLength(1)
    expect(spans[0].textContent).toBe('AB')
    expect(spans[0].style.color).toBe('red')
  })
})
