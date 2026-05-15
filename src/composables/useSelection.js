// 这个模块统一管理编辑器的“已保存选区”。
// 工具栏在失去原生焦点后，仍然依赖这里缓存的 Range 对选中文本继续应用样式。
// 每个编辑器实例都应该创建自己的 selection store，避免多个组件实例互相覆盖选区。

// 只有选区仍然位于编辑器根节点内部时，才允许保存或恢复，避免误操作到页面其它区域。
export function isRangeInEditor(range, root) {
  if (!range || !root) {
    return false
  }

  const { commonAncestorContainer } = range
  return root.contains(commonAncestorContainer)
}

export function createSelectionStore() {
  let savedRange = null

  // 从浏览器当前 Selection 中克隆出一份 Range，保存为稳定的逻辑选区。
  function saveRange(root) {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) {
      return
    }

    const range = selection.getRangeAt(0)
    if (!isRangeInEditor(range, root)) {
      return
    }

    savedRange = range.cloneRange()
  }

  // 把已保存选区恢复回浏览器 Selection。
  // 这主要用于需要重新显示原生选中效果的场景。
  function restoreRange(root) {
    const range = getRange(root)
    if (!range) {
      return
    }

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  // 允许外部直接传入一份 Range，替换当前缓存。
  function setRange(range) {
    savedRange = range?.cloneRange?.() ?? null
  }

  // 供编辑器和工具栏读取最近一次保存的选区。
  function getRange(root = null) {
    if (root && savedRange && !isRangeInEditor(savedRange, root)) {
      savedRange = null
    }

    return savedRange
  }

  return {
    getRange,
    restoreRange,
    saveRange,
    setRange,
  }
}

const defaultSelectionStore = createSelectionStore()

export const saveRange = defaultSelectionStore.saveRange
export const restoreRange = defaultSelectionStore.restoreRange
export const setRange = defaultSelectionStore.setRange
export const getRange = defaultSelectionStore.getRange
