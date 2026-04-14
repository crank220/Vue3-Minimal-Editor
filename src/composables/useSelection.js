let savedRange = null

function isInEditor(range, root) {
  if (!range || !root) {
    return false
  }

  const { commonAncestorContainer } = range
  return root.contains(commonAncestorContainer)
}

export function saveRange(root) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) {
    return
  }

  const range = selection.getRangeAt(0)
  if (!isInEditor(range, root)) {
    return
  }

  savedRange = range.cloneRange()
}

export function restoreRange(root) {
  if (!savedRange || !root || !isInEditor(savedRange, root)) {
    return
  }

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(savedRange)
}

export function setRange(range) {
  savedRange = range?.cloneRange?.() ?? null
}

export function getRange() {
  return savedRange
}
