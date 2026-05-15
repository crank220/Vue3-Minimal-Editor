import { describe, expect, it } from 'vitest'
import { parseCssTextShadow, splitCssValueList, tokenizeCssValue } from '../../src/utils/cssTextShadow'

describe('cssTextShadow helpers', () => {
  it('splits shadow lists without splitting color function commas', () => {
    expect(splitCssValueList('1px 2px 0 rgb(0, 0, 0), rgba(255, 0, 0, 0.5) 3px 4px 0')).toEqual([
      '1px 2px 0 rgb(0, 0, 0)',
      'rgba(255, 0, 0, 0.5) 3px 4px 0',
    ])
  })

  it('keeps parenthesized color functions as one token', () => {
    expect(tokenizeCssValue('rgba(255, 0, 0, 0.5) 3px 4px 0')).toEqual([
      'rgba(255, 0, 0, 0.5)',
      '3px',
      '4px',
      '0',
    ])
  })

  it('parses text-shadow entries for canvas export', () => {
    expect(parseCssTextShadow('1px 2px 3px rgb(0, 0, 0), rgba(255, 0, 0, 0.5) 4px 5px 0')).toEqual([
      {
        x: '1px',
        y: '2px',
        blur: '3px',
        color: 'rgb(0, 0, 0)',
      },
      {
        x: '4px',
        y: '5px',
        blur: '0',
        color: 'rgba(255, 0, 0, 0.5)',
      },
    ])
  })
})
