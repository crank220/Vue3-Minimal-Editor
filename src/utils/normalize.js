// 编辑区 DOM 归一化工具：
// 用于在多次包裹 span、修改样式后，尽量把结构整理回较干净的状态。
export function normalize(root) {
  if (!root) {
    return
  }

  // 归一化会循环执行，直到本轮不再产生任何结构变化为止。
  let changed = false

  do {
    changed = false
    changed = mergeSameSpan(root) || changed
    changed = unwrapNestedSpan(root) || changed
    changed = removeEmptySpan(root) || changed
    root.normalize()
  } while (changed)
}

// 合并相邻且 style 完全一致的 span，减少重复包裹层级。
function mergeSameSpan(root) {
  let changed = false
  const spans = [...root.querySelectorAll('span')]

  spans.forEach((span) => {
    if (!span.isConnected) {
      return
    }

    let next = getNextMeaningfulSibling(span)

    while (
      next &&
      next.nodeType === Node.ELEMENT_NODE &&
      next.tagName === 'SPAN' &&
      getNormalizedStyleText(span) === getNormalizedStyleText(next)
    ) {
      while (next.firstChild) {
        span.appendChild(next.firstChild)
      }

      next.remove()
      changed = true
      next = getNextMeaningfulSibling(span)
    }
  })

  return changed
}

// 当子 span 只是在重复父级已经拥有的样式时，移除冗余样式甚至直接展开子节点。
function unwrapNestedSpan(root) {
  let changed = false
  const nestedSpans = [...root.querySelectorAll('span span')]

  nestedSpans.forEach((child) => {
    const parent = child.parentElement
    if (!parent || parent.tagName !== 'SPAN') {
      return
    }

    removeInheritedStyle(parent, child)

    if (!child.getAttribute('style')) {
      while (child.firstChild) {
        parent.insertBefore(child.firstChild, child)
      }
      child.remove()
      changed = true
    }
  })

  return changed
}

// 删除既没有有效文本，也没有 `<br>` 之类结构意义的空 span。
function removeEmptySpan(root) {
  let changed = false
  const spans = [...root.querySelectorAll('span')]

  spans.forEach((span) => {
    if (!span.textContent?.trim() && !span.querySelector('br')) {
      span.remove()
      changed = true
    }
  })

  return changed
}

// 查找真正有意义的下一个兄弟节点，同时顺手清理纯空白文本节点。
function getNextMeaningfulSibling(node) {
  let next = node.nextSibling

  while (next && next.nodeType === Node.TEXT_NODE && !next.textContent?.trim()) {
    const emptyText = next
    next = next.nextSibling
    emptyText.remove()
  }

  return next
}

// 把 style 对象序列化成稳定字符串，用于比较两个 span 是否等价。
function getNormalizedStyleText(element) {
  return serializeStyle(element.style)
}

// 从子节点里删掉那些和父节点完全一致的样式声明。
function removeInheritedStyle(parent, child) {
  const parentStyle = styleToMap(parent.style)

  Array.from(child.style).forEach((property) => {
    const childValue = child.style.getPropertyValue(property).trim().toLowerCase()
    const parentValue = parentStyle.get(property)

    if (parentValue === childValue) {
      child.style.removeProperty(property)
    }
  })
}

// 把 CSSStyleDeclaration 转成 Map，方便做属性级比较。
function styleToMap(style) {
  const map = new Map()

  Array.from(style).forEach((property) => {
    map.set(property, style.getPropertyValue(property).trim().toLowerCase())
  })

  return map
}

// 用排序后的 `key:value` 串生成稳定签名，避免属性顺序不同导致比较失真。
function serializeStyle(style) {
  return Array.from(style)
    .sort()
    .map((property) => `${property}:${style.getPropertyValue(property).trim().toLowerCase()}`)
    .join(';')
}
