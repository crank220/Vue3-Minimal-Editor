// text-shadow 共享解析工具。CSS 颜色函数内部也可能包含逗号，
// 所以拆分阴影列表时必须跟踪括号深度。
export function splitCssValueList(value) {
  const items = []
  let item = ''
  let depth = 0

  for (const character of String(value ?? '')) {
    if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth = Math.max(0, depth - 1)
    }

    if (character === ',' && depth === 0) {
      if (item.trim()) {
        items.push(item.trim())
      }
      item = ''
      continue
    }

    item += character
  }

  if (item.trim()) {
    items.push(item.trim())
  }

  return items
}

export function tokenizeCssValue(value) {
  const tokens = []
  let token = ''
  let depth = 0

  for (const character of String(value ?? '').trim()) {
    if (character === '(') {
      depth += 1
    } else if (character === ')') {
      depth = Math.max(0, depth - 1)
    }

    // rgba()/color-mix() 内部的空格属于颜色函数，不应被拆成新的 token。
    if (/\s/.test(character) && depth === 0) {
      if (token) {
        tokens.push(token)
        token = ''
      }
      continue
    }

    token += character
  }

  if (token) {
    tokens.push(token)
  }

  return tokens
}

export function parseCssTextShadow(value) {
  if (!value || value === 'none') {
    return []
  }

  return splitCssValueList(value)
    .map(parseCssTextShadowEntry)
    .filter(Boolean)
}

function parseCssTextShadowEntry(entry) {
  const tokens = tokenizeCssValue(entry)
  const lengths = []
  const colorTokens = []

  // CSS 允许颜色写在长度值前后，这里先取前 2-3 个长度，其余 token 归为颜色。
  tokens.forEach((token) => {
    if (isCssLengthToken(token) && lengths.length < 3) {
      lengths.push(token)
      return
    }

    colorTokens.push(token)
  })

  if (lengths.length < 2) {
    return null
  }

  return {
    x: lengths[0],
    y: lengths[1],
    blur: lengths[2] ?? '0',
    color: colorTokens.join(' '),
  }
}

function isCssLengthToken(value) {
  // canvas 渲染最终只需要 px 数值；这里先宽松接收 CSS length，再由调用方 parseFloat。
  return /^-?(?:\d+|\d*\.\d+)(?:[a-z%]+)?$/i.test(String(value ?? '').trim())
}
