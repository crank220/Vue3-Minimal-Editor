// 编辑器实例自己的选区仓库。
// 插件化后不能再使用模块级单例，否则多个编辑器实例会互相覆盖选区。
export function createSelectionStore() {
  let savedRange = null

  function isInEditor(range, root) {
    if (!range || !root) {
      return false
    }

    const { commonAncestorContainer } = range
    return root.contains(commonAncestorContainer)
  }

  function saveRange(root) {
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

  function restoreRange(root) {
    if (!savedRange || !root || !isInEditor(savedRange, root)) {
      return
    }

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(savedRange)
  }

  function setRange(range) {
    savedRange = range?.cloneRange?.() ?? null
  }

  function getRange() {
    return savedRange
  }

  function clearRange() {
    savedRange = null
  }

  return {
    saveRange,
    restoreRange,
    setRange,
    getRange,
    clearRange,
  }
}
