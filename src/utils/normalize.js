export function normalize(root) {
  if (!root) {
    return
  }

  let changed = false

  do {
    changed = false
    changed = mergeSameSpan(root) || changed
    changed = unwrapNestedSpan(root) || changed
    changed = removeEmptySpan(root) || changed
    root.normalize()
  } while (changed)
}

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

function getNextMeaningfulSibling(node) {
  let next = node.nextSibling

  while (next && next.nodeType === Node.TEXT_NODE && !next.textContent?.trim()) {
    const emptyText = next
    next = next.nextSibling
    emptyText.remove()
  }

  return next
}

function getNormalizedStyleText(element) {
  return serializeStyle(element.style)
}

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

function styleToMap(style) {
  const map = new Map()

  Array.from(style).forEach((property) => {
    map.set(property, style.getPropertyValue(property).trim().toLowerCase())
  })

  return map
}

function serializeStyle(style) {
  return Array.from(style)
    .sort()
    .map((property) => `${property}:${style.getPropertyValue(property).trim().toLowerCase()}`)
    .join(';')
}
