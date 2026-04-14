<script setup>
// 主编辑器组件。
// 这里负责三件事：
// 1. 管理 contenteditable 编辑区；
// 2. 把工具栏状态即时应用到选中文本；
// 3. 将编辑内容同步给预览区与切图区。
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import PreviewPanel from './PreviewPanel.vue'
import ToolbarPanel from './ToolbarPanel.vue'
import { saveRange, getRange, setRange } from '../composables/useSelection'
import {
  DEFAULT_EDITOR_BOX_STATE,
  DEFAULT_PREVIEW_STATE,
  DEFAULT_STYLE_STATE,
  editorBoxState,
  previewState,
  resolveFontFamily,
  styleState,
  styleToCss,
} from '../composables/useStyle'
import { normalize } from '../utils/normalize'

// 编辑区 DOM、预览组件实例以及若干联动状态。
const editorRef = ref(null)
const previewPanelRef = ref(null)
const isSyncingToolbar = ref(false)
const previewSource = ref({
  html: '',
  singleLineHtml: '',
})
const editorScrollState = ref({
  clientHeight: 0,
  scrollHeight: 0,
  scrollTop: 0,
})

// 编辑舞台的对齐方式由共享样式状态驱动，用于控制编辑区在容器中的停靠位置。
const editorStyle = computed(() => ({
  textAlign: styleState.textAlign,
  alignItems: styleState.verticalAlign,
}))

// 将输入状态标准化为可直接用于布局计算的数字盒模型。
const editorBoxMetrics = computed(() => ({
  width: normalizeDimension(editorBoxState.width, DEFAULT_EDITOR_BOX_STATE.width),
  height: normalizeDimension(editorBoxState.height, DEFAULT_EDITOR_BOX_STATE.height),
  paddingTop: normalizeSpacing(editorBoxState.paddingTop, DEFAULT_EDITOR_BOX_STATE.paddingTop),
  paddingRight: normalizeSpacing(editorBoxState.paddingRight, DEFAULT_EDITOR_BOX_STATE.paddingRight),
  paddingBottom: normalizeSpacing(editorBoxState.paddingBottom, DEFAULT_EDITOR_BOX_STATE.paddingBottom),
  paddingLeft: normalizeSpacing(editorBoxState.paddingLeft, DEFAULT_EDITOR_BOX_STATE.paddingLeft),
}))

// 将数字盒模型转换为编辑区 DOM 可直接使用的内联样式。
const editorBoxStyle = computed(() => ({
  width: `${editorBoxMetrics.value.width}px`,
  height: `${editorBoxMetrics.value.height}px`,
  paddingTop: `${editorBoxMetrics.value.paddingTop}px`,
  paddingRight: `${editorBoxMetrics.value.paddingRight}px`,
  paddingBottom: `${editorBoxMetrics.value.paddingBottom}px`,
  paddingLeft: `${editorBoxMetrics.value.paddingLeft}px`,
}))

// 判断编辑区当前是否真的需要显示滚动指示器。
const hasEditorScroll = computed(
  () => editorScrollState.value.scrollHeight > editorScrollState.value.clientHeight + 1,
)

const editorScrollThumbStyle = computed(() => {
  // 根据滚动比例计算悬浮滚动条 thumb 的高度和位移。
  const { clientHeight, scrollHeight, scrollTop } = editorScrollState.value
  if (!hasEditorScroll.value || clientHeight <= 0 || scrollHeight <= 0) {
    return {
      height: '0px',
      transform: 'translateY(0px)',
    }
  }

  const thumbHeight = Math.max(28, (clientHeight / scrollHeight) * clientHeight)
  const maxThumbTop = Math.max(0, clientHeight - thumbHeight)
  const maxScrollTop = Math.max(1, scrollHeight - clientHeight)
  const thumbTop = (scrollTop / maxScrollTop) * maxThumbTop

  return {
    height: `${thumbHeight}px`,
    transform: `translateY(${thumbTop}px)`,
  }
})

function saveSelection() {
  // 在鼠标抬起、键盘选择或重新聚焦后缓存选区。
  // 同时刷新工具栏回显、预览 HTML 和滚动状态。
  clearSelectionPreview()
  saveRange(editorRef.value)
  syncToolbarFromSelection()
  syncPreviewSource()
  syncEditorScrollState()
}

function applyStyleToSelection() {
  // 将当前工具栏状态应用到缓存选区。
  // 如果命中的是同一个 span，则直接改样式；
  // 如果是跨节点选区，则抽取内容后重新包裹一个 span。
  const range = getRange()?.cloneRange()
  if (!range || range.collapsed) {
    return
  }

  const targetSpan = getSelectedSpan(range)
  const span = targetSpan ?? document.createElement('span')

  clearSelectionPreview()
  Object.assign(span.style, styleToCss(styleState))
  applyStrokeMeta(span)

  if (!targetSpan) {
    const content = range.extractContents()
    unwrapFragmentSpans(content)
    span.appendChild(content)
    range.insertNode(span)
  }

  const nextRange = document.createRange()
  nextRange.selectNodeContents(span)
  setRange(nextRange)
  setSelectionPreview(span)

  nextTick(() => {
    if (editorRef.value) {
      normalize(editorRef.value)
      syncToolbarFromSelection()
      syncPreviewSource()
      syncEditorScrollState()
    }
  })
}

function onInput() {
  // 用户直接在 contenteditable 内输入后：
  // 1. 做一次 DOM 归一化；
  // 2. 重新缓存选区；
  // 3. 同步工具栏与预览数据。
  nextTick(() => {
    if (editorRef.value) {
      normalize(editorRef.value)
      saveRange(editorRef.value)
      syncToolbarFromSelection()
      syncPreviewSource()
      syncEditorScrollState()
    }
  })
}

function syncToolbarFromSelection() {
  // 从当前选区命中的节点反向读取计算样式，并写回工具栏状态。
  const range = getRange()
  if (!editorRef.value || !range) {
    return
  }

  const target = getSelectionStyleTarget(range, editorRef.value)
  if (!target) {
    return
  }

  const computedStyle = window.getComputedStyle(target)
  const strokeMeta = getStrokeMeta(target)

  patchStyleState({
    fontSize: Math.round(parsePixelValue(computedStyle.fontSize, DEFAULT_STYLE_STATE.fontSize)),
    fontFamily: resolveFontFamily(computedStyle.fontFamily),
    color: parseColorValue(computedStyle.color, DEFAULT_STYLE_STATE.color),
    background: parseColorValue(computedStyle.backgroundColor, DEFAULT_STYLE_STATE.background),
    bold: isBoldWeight(computedStyle.fontWeight),
    italic: computedStyle.fontStyle === 'italic',
    underline: computedStyle.textDecorationLine.includes('underline'),
    letterSpacing: parsePixelValue(
      computedStyle.letterSpacing,
      DEFAULT_STYLE_STATE.letterSpacing,
    ),
    lineHeight: parseLineHeight(
      computedStyle.lineHeight,
      computedStyle.fontSize,
      DEFAULT_STYLE_STATE.lineHeight,
    ),
    strokeColor: strokeMeta.strokeColor,
    strokeWidth: strokeMeta.strokeWidth,
    strokePosition: strokeMeta.strokePosition,
  })
}

function patchStyleState(nextState) {
  // 回填工具栏时需要阻断“工具栏变更 -> 重新套样式”的监听回路。
  isSyncingToolbar.value = true
  Object.assign(styleState, nextState)
  isSyncingToolbar.value = false
}

function getSelectionStyleTarget(range, root) {
  // 选区回显优先找最近的 span；
  // 如果没有显式 span，则回落到当前起始元素或编辑区根节点。
  const startElement = getElementFromNode(range.startContainer, root)
  if (startElement) {
    return startElement.closest('span') ?? startElement
  }

  return root
}

function getElementFromNode(node, root) {
  // 将 Range 的起点节点统一解析为元素节点，方便后续查样式。
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement
  if (!element || !root.contains(element)) {
    return root
  }

  return element
}

function getSelectedSpan(range) {
  // 判断当前选区是否刚好完整命中某个 span。
  // 如果是，则可以直接原地改这个 span，避免生成多余嵌套。
  const container = range.startContainer

  if (container === range.endContainer && container.nodeType === Node.ELEMENT_NODE) {
    if (container.tagName === 'SPAN' && range.startOffset === 0 && range.endOffset === container.childNodes.length) {
      return container
    }

    if (range.endOffset - range.startOffset === 1) {
      const child = container.childNodes[range.startOffset]
      if (child?.nodeType === Node.ELEMENT_NODE && child.tagName === 'SPAN') {
        return child
      }
    }
  }

  if (
    container.nodeType === Node.TEXT_NODE &&
    range.endContainer.nodeType === Node.TEXT_NODE &&
    container.parentElement &&
    container.parentElement === range.endContainer.parentElement &&
    container.parentElement.tagName === 'SPAN' &&
    range.startOffset === 0 &&
    range.endOffset === range.endContainer.textContent.length &&
    container.parentElement.childNodes.length === 1
  ) {
    return container.parentElement
  }

  return null
}

function unwrapFragmentSpans(fragment) {
  // 对 extractContents 得到的片段进行扁平化处理，
  // 防止旧样式 span 被再次包裹，导致层级越来越深。
  const spans = [...fragment.querySelectorAll('span')]

  spans.forEach((child) => {
    const parent = child.parentNode
    if (!parent) {
      return
    }

    while (child.firstChild) {
      parent.insertBefore(child.firstChild, child)
    }

    child.remove()
  })
}

function clearSelectionPreview() {
  // 清理上一次为了“保持选中感”而打上的临时标记。
  editorRef.value
    ?.querySelectorAll('[data-selection-preview="true"]')
    .forEach((element) => element.removeAttribute('data-selection-preview'))
}

function setSelectionPreview(element) {
  // 给当前样式应用后的 span 打标记，用于模拟持续选中高亮。
  if (!element) {
    return
  }

  element.setAttribute('data-selection-preview', 'true')
}

function applyStrokeMeta(element) {
  // 描边位置不是标准 CSS 语义，因此额外通过 data-* 保存原始业务值，
  // 方便后续重新选中时正确回显工具栏。
  if (!element) {
    return
  }

  if (styleState.strokeWidth > 0) {
    element.dataset.strokeColor = styleState.strokeColor
    element.dataset.strokeWidth = String(styleState.strokeWidth)
    element.dataset.strokePosition = styleState.strokePosition
    return
  }

  delete element.dataset.strokeColor
  delete element.dataset.strokeWidth
  delete element.dataset.strokePosition
}

function getStrokeMeta(target) {
  // 先尝试读我们自己保存的 data-* 描边元数据；
  // 如果没有，再回退到浏览器计算样式。
  const span = target?.closest?.('span') ?? (target?.tagName === 'SPAN' ? target : null)
  if (!span?.dataset.strokeWidth) {
    return {
      strokeColor: parseColorValue(
        window.getComputedStyle(target).getPropertyValue('-webkit-text-stroke-color'),
        DEFAULT_STYLE_STATE.strokeColor,
      ),
      strokeWidth: parsePixelValue(
        window.getComputedStyle(target).getPropertyValue('-webkit-text-stroke-width'),
        DEFAULT_STYLE_STATE.strokeWidth,
      ),
      strokePosition: DEFAULT_STYLE_STATE.strokePosition,
    }
  }

  return {
    strokeColor: span.dataset.strokeColor ?? DEFAULT_STYLE_STATE.strokeColor,
    strokeWidth: parsePixelValue(span.dataset.strokeWidth, DEFAULT_STYLE_STATE.strokeWidth),
    strokePosition: span.dataset.strokePosition ?? DEFAULT_STYLE_STATE.strokePosition,
  }
}

function parsePixelValue(value, fallback) {
  // 将 `12px`、`1.5px` 等值统一解析为数字。
  if (!value || value === 'normal') {
    return fallback
  }

  const number = Number.parseFloat(value)
  return Number.isFinite(number) ? Number(number.toFixed(2)) : fallback
}

function parseLineHeight(value, fontSize, fallback) {
  // 浏览器计算后的 line-height 可能是像素值，
  // 这里把它重新换算回工具栏使用的倍数值。
  if (!value || value === 'normal') {
    return fallback
  }

  const lineHeight = Number.parseFloat(value)
  const size = Number.parseFloat(fontSize)
  if (!Number.isFinite(lineHeight) || !Number.isFinite(size) || size === 0) {
    return fallback
  }

  return Number((lineHeight / size).toFixed(2))
}

function parseColorValue(value, fallback) {
  // 将 rgb / rgba / hex 等颜色格式统一转换为 hex，便于颜色控件回显。
  if (!value) {
    return fallback
  }

  if (value === 'transparent' || value === 'rgba(0, 0, 0, 0)') {
    return fallback === 'transparent' ? 'transparent' : fallback
  }

  if (value.startsWith('#')) {
    return value.toLowerCase()
  }

  const channels = value.match(/[\d.]+/g)
  if (!channels || channels.length < 3) {
    return fallback
  }

  const alpha = channels[3] === undefined ? 1 : Number.parseFloat(channels[3])
  if (Number.isFinite(alpha) && alpha === 0) {
    return fallback === 'transparent' ? 'transparent' : fallback
  }

  const [red, green, blue] = channels.slice(0, 3).map((channel) => {
    const number = Number.parseFloat(channel)
    return Math.max(0, Math.min(255, Math.round(number)))
  })

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`
}

function isBoldWeight(value) {
  // 同时兼容 `bold` 和数值型 font-weight。
  if (value === 'bold') {
    return true
  }

  const weight = Number.parseInt(value, 10)
  return Number.isFinite(weight) && weight >= 600
}

function toHex(value) {
  // 将 0-255 的通道值转换为两位十六进制字符串。
  return value.toString(16).padStart(2, '0')
}

function syncPreviewSource() {
  // 将编辑区 HTML 同步给预览区。
  // 单行预览需要把换行转成空格占位，避免真正换行。
  if (!editorRef.value) {
    return
  }

  const html = sanitizePreviewHtml(editorRef.value.innerHTML)

  previewSource.value = {
    html,
    singleLineHtml: html.replace(/<br\s*\/?>/gi, '<span> </span>'),
  }
}

function sanitizePreviewHtml(value) {
  // 预览与切图不需要选区高亮，因此同步前移除临时标记属性。
  return String(value ?? '')
    .replace(/\sdata-selection-preview="true"/g, '')
    .replace(/\sdata-selection-preview='true'/g, '')
}

function syncEditorScrollState() {
  // 同步编辑区滚动尺寸，供自定义悬浮滚动条计算使用。
  if (!editorRef.value) {
    return
  }

  editorScrollState.value = {
    clientHeight: editorRef.value.clientHeight,
    scrollHeight: editorRef.value.scrollHeight,
    scrollTop: editorRef.value.scrollTop,
  }
}

function normalizeDimension(value, fallback) {
  // 宽高最小限制为 120，避免编辑区被缩成不可用尺寸。
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.max(120, Math.round(number))
}

function normalizeSpacing(value, fallback) {
  // 内边距统一做非负整数约束。
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.max(0, Math.round(number))
}

function requestCutImages() {
  // 通过子组件暴露的方法触发切图。
  previewPanelRef.value?.generateCutImages?.()
}

onMounted(() => {
  // 初次挂载时同步一次预览内容与滚动状态。
  syncPreviewSource()
  syncEditorScrollState()
})

watch(
  previewState,
  () => {
    // 统一约束预览相关的数值输入范围，避免非法值进入后续布局逻辑。
    previewState.pageStaySeconds = Math.min(
      9999,
      Math.max(1, Number.parseInt(previewState.pageStaySeconds, 10) || DEFAULT_PREVIEW_STATE.pageStaySeconds),
    )
    previewState.cutImageWidth = Math.min(
      65536,
      Math.max(
        1,
        Number.parseInt(previewState.cutImageWidth, 10) || editorBoxState.width || DEFAULT_EDITOR_BOX_STATE.width,
      ),
    )
    previewState.singleLineSpeed = Math.min(
      9,
      Math.max(1, Number.parseInt(previewState.singleLineSpeed, 10) || DEFAULT_PREVIEW_STATE.singleLineSpeed),
    )
  },
  { deep: true },
)

watch(
  editorBoxMetrics,
  () => {
    // 编辑区尺寸变化后重新计算滚动条状态。
    nextTick(() => {
      syncEditorScrollState()
    })
  },
  { deep: true },
)

watch(
  styleState,
  () => {
    // 工具栏样式一旦变化就立即应用到当前缓存选区。
    if (isSyncingToolbar.value) {
      return
    }

    applyStyleToSelection()
  },
  { deep: true, flush: 'sync' },
)
</script>

<template>
  <!-- 主编辑器页面：工具栏、编辑区、预览区三段式结构。 -->
  <main class="editor-shell">
    <!-- <section class="intro-card">
      <p class="eyebrow">Vue3 Minimal Editor</p>
      <h1>contenteditable + Range + normalize</h1>
      <p class="intro-copy">
        This follows the shared architecture closely: keep the editable layer limited to
        <code>span</code> and <code>br</code>, then use selection restore, style state, and
        a normalize pass to keep the DOM predictable.
      </p>
    </section> -->

    <section class="workspace-card">
      <!-- 工具栏只改状态，不直接操作内容。 -->
      <ToolbarPanel @cut-images="requestCutImages" />

      <!-- 编辑舞台负责承载编辑区本体。 -->
      <div class="editor-stage" :style="editorStyle">
        <div class="editor-panel" :style="{ width: editorBoxStyle.width, height: editorBoxStyle.height }">
          <div
            ref="editorRef"
            class="editor"
            :style="editorBoxStyle"
            contenteditable="true"
            spellcheck="false"
            @mouseup="saveSelection"
            @keyup="saveSelection"
            @focus="saveSelection"
            @input="onInput"
            @scroll="syncEditorScrollState"
          >
一个基于 `Vue 3 + Vite` 的文本编辑、实时预览、分页播放与 PNG 切图工具。

这个项目不是通用型富文本编辑器，而是一个“排版可控、预览可控、切图可控”的前端文本引擎。它直接建立在浏览器原生能力之上：`contenteditable`、`Range`、`Selection`、DOM 归一化、Canvas 渲染，不依赖 Quill、Slate、Tiptap 等第三方编辑器框架。

项目当前关注的核心目标有 4 个：

1. 选区稳定：工具栏操作不应打断文本选中，也不应因为输入数值而丢失选区。
2. 结构稳定：编辑区 DOM 必须尽量保持简单、可预测，避免重复嵌套和样式碎片化。
3. 预览稳定：预览区应当尽量复用编辑区的同源内容和同源盒模型。
4. 导出稳定：切图不依赖 `foreignObject`，避免 canvas 被污染导致 PNG 导出失败。

## 项目能力

当前实现的能力包括：

1. 在 `contenteditable` 编辑区中选择文本，并立即应用工具栏样式。
2. 支持字体、字号、文字颜色、背景色、粗体、斜体、下划线。
3. 支持字间距、行高、描边颜色、描边宽度、描边位置。
4. 支持文本水平对齐、垂直对齐。
5. 支持编辑区宽度、高度、四向内边距设置。
6. 支持多行预览和单行预览两种模式。
7. 多行模式支持静态翻页和方向翻页动画。
8. 单行模式支持静态、左移、右移、无缝循环。
9. 支持按预览结果生成 PNG，并在页面下方查看切图预览。
10. 支持自定义编辑区悬浮滚动条，鼠标移入时显示，且不挤压内容。
          </div>

          <div v-if="hasEditorScroll" class="editor-scrollbar">
            <div class="editor-scrollbar-thumb" :style="editorScrollThumbStyle" />
          </div>
        </div>
      </div>

      <!-- 预览区与切图区共享同一份编辑内容。 -->
      <PreviewPanel
        ref="previewPanelRef"
        :box-metrics="editorBoxMetrics"
        :content-html="previewSource.html"
        :single-line-html="previewSource.singleLineHtml"
        :preview-config="previewState"
        :text-align="styleState.textAlign"
        :vertical-align="styleState.verticalAlign"
      />
    </section>
  </main>
</template>

<style scoped>
/* 页面外层容器，限制整体最大宽度并控制上下留白。 */
.editor-shell {
  width: 1200px;
  margin: 0 auto;
  padding: 48px 0 56px;
}

/* 首页卡片和工作区卡片共用统一的圆角玻璃态风格。 */
.intro-card,
.workspace-card {
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(18px);
  box-shadow: 0 24px 80px rgba(34, 49, 74, 0.12);
}

/* 以下是默认示例区遗留样式，当前主页面未实际展示。 */
.intro-card {
  padding: 32px;
}

.eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #b46619;
}

h1 {
  margin: 0;
  font-size: clamp(32px, 5vw, 56px);
  line-height: 1.02;
  letter-spacing: -0.04em;
}

.intro-copy {
  max-width: 720px;
  margin: 16px 0 0;
  font-size: 16px;
  color: #556277;
}

code {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(13, 20, 33, 0.06);
}

.workspace-card {
  margin-top: 18px;
  padding: 20px;
}

/* 编辑舞台提供外层背景和对齐环境。 */
.editor-stage {
  min-height: 420px;
  margin-top: 18px;
  padding: 24px;
  border-radius: 24px;
  border: 1px dashed rgba(30, 41, 59, 0.18);
  background:
    linear-gradient(rgba(229, 236, 246, 0.82), rgba(229, 236, 246, 0.82)),
    linear-gradient(90deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.95));
  display: flex;
}

/* 用于承载编辑区本体和悬浮滚动条。 */
.editor-panel {
  position: relative;
}

/* 真正的 contenteditable 区域。 */
.editor {
  overflow: auto;
  padding: 20px 24px;
  border-radius: 20px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  background: white;
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 24px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  scrollbar-width: none;
  -ms-overflow-style: none;
}

/* 隐藏浏览器原生滚动条，由自定义悬浮滚动条代替。 */
.editor::-webkit-scrollbar {
  width: 0;
  height: 0;
}

/* 为已应用样式的选区保留一层可视高亮。 */
.editor :deep([data-selection-preview='true']) {
  border-radius: 4px;
  box-shadow: inset 0 -1.1em rgba(54, 107, 255, 0.2);
}

/* 悬浮滚动条轨道。 */
.editor-scrollbar {
  position: absolute;
  top: 8px;
  right: 8px;
  bottom: 8px;
  width: 8px;
  border-radius: 999px;
  background: transparent;
  pointer-events: none;
  opacity: 0;
  transition: opacity 120ms ease;
}

/* 悬停编辑区时再显示滚动条，避免长期占据视觉注意力。 */
.editor-panel:hover .editor-scrollbar {
  opacity: 1;
}

/* 滚动条 thumb。 */
.editor-scrollbar-thumb {
  width: 100%;
  border-radius: 999px;
  background: rgba(24, 33, 47, 0.28);
}

/* 编辑区聚焦态。 */
.editor:focus {
  border-color: rgba(54, 107, 255, 0.35);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    0 0 0 4px rgba(54, 107, 255, 0.12);
}

@media (max-width: 720px) {
  /* 移动端整体缩小圆角、留白与字号。 */
  .editor-shell {
    width: min(100vw - 20px, 1120px);
    padding: 20px 0 28px;
  }

  .intro-card,
  .workspace-card {
    border-radius: 22px;
  }

  .intro-card {
    padding: 24px 20px;
  }

  .workspace-card {
    padding: 14px;
  }

  .editor-stage,
  .editor {
    border-radius: 18px;
  }

  .editor {
    min-height: 260px;
    padding: 18px;
    font-size: 20px;
  }
}
</style>
