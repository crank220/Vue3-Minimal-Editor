export function normalize(root) {
  mergeSameSpan(root)
  unwrapNestedSpan(root)
  removeEmptySpan(root)
}

function mergeSameSpan(root) {
  const spans = [...root.querySelectorAll('span')]

  spans.forEach((span) => {
    const next = span.nextSibling

    if (
      next &&
      next.nodeType === Node.ELEMENT_NODE &&
      next.tagName === 'SPAN' &&
      span.getAttribute('style') === next.getAttribute('style')
    ) {
      next.innerHTML = span.innerHTML + next.innerHTML
      span.remove()
    }
  })
}

function unwrapNestedSpan(root) {
  const nestedSpans = [...root.querySelectorAll('span span')]

  nestedSpans.forEach((child) => {
    const parent = child.parentElement
    if (!parent || parent.tagName !== 'SPAN') {
      return
    }

    if (parent.getAttribute('style') === child.getAttribute('style')) {
      while (child.firstChild) {
        parent.insertBefore(child.firstChild, child)
      }
      child.remove()
    }
  })
}

function removeEmptySpan(root) {
  const spans = [...root.querySelectorAll('span')]

  spans.forEach((span) => {
    if (!span.textContent?.trim()) {
      span.remove()
    }
  })
}
