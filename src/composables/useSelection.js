// 这个模块统一管理编辑器的“已保存选区”。
// 工具栏在失去原生焦点后，仍然依赖这里缓存的 Range 对选中文本继续应用样式。
let savedRange = null

// 只有选区仍然位于编辑器根节点内部时，才允许保存或恢复，避免误操作到页面其它区域。
function isInEditor(range, root) {
  if (!range || !root) {
    return false
  }

  const { commonAncestorContainer } = range
  return root.contains(commonAncestorContainer)
}

// 从浏览器当前 Selection 中克隆出一份 Range，保存为稳定的逻辑选区。
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

// 把已保存选区恢复回浏览器 Selection。
// 这主要用于需要重新显示原生选中效果的场景。
export function restoreRange(root) {
  if (!savedRange || !root || !isInEditor(savedRange, root)) {
    return
  }

  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(savedRange)
}

// 允许外部直接传入一份 Range，替换当前缓存。
export function setRange(range) {
  savedRange = range?.cloneRange?.() ?? null
}

// 供编辑器和工具栏读取最近一次保存的选区。
export function getRange() {
  return savedRange
}
