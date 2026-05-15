<script setup>
// 主编辑器组件。
// 这里负责三件事：
// 1. 管理 contenteditable 编辑区；
// 2. 把工具栏状态即时应用到选中文本；
// 3. 将编辑内容同步给预览区与切图区。
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import PreviewPanel from './PreviewPanel.vue'
import ToolbarPanel from './ToolbarPanel.vue'
import { DEFAULT_EDITOR_HTML } from '../constants/defaultContent'
import { createSelectionStore } from '../composables/useSelection'
import {
  DEFAULT_EDITOR_BOX_STATE,
  DEFAULT_STYLE_STATE,
  MAX_EDITOR_DIMENSION,
  MAX_EDITOR_PADDING,
  MIN_EDITOR_DIMENSION,
  cloneTextEditorAnnotations,
  createTextEditorAnnotations,
  normalizePreviewConfig,
  patchTextEditorAnnotations,
  resolveFontFamily,
  styleToCss,
} from '../composables/useStyle'
import { normalize } from '../utils/normalize'
import { sanitizeEditorHtml } from '../utils/sanitizeHtml'

defineOptions({
  name: 'HdTextEditor',
})

const props = defineProps({
  // html 是插件的受控内容入口，父组件可通过 v-model:html 双向绑定。
  html: {
    type: String,
    default: DEFAULT_EDITOR_HTML,
  },
  // annotations 是统一的“标注”入口，内部包含文本样式、盒模型与预览切图配置。
  annotations: {
    type: Object,
    default: () => createTextEditorAnnotations(),
  },
})

const emit = defineEmits(['update:html', 'update:annotations', 'screenshot', 'screenshots'])

const annotationsState = reactive(createTextEditorAnnotations(props.annotations))
const styleState = annotationsState.style
const editorBoxState = annotationsState.editorBox
const previewState = annotationsState.preview

// 编辑区滚动容器、可编辑内容根节点、预览组件实例以及若干联动状态。
const editorRef = ref(null)
const editorContentRef = ref(null)
const previewPanelRef = ref(null)
const isSyncingToolbar = ref(false)
const selectionStore = createSelectionStore()
let isPatchingAnnotationsFromProps = false
const previewSource = ref({
  html: '',
  singleLineHtml: '',
})
const editorScrollState = ref({
  clientHeight: 0,
  scrollHeight: 0,
  scrollTop: 0,
})

// 传给自定义插槽的最小能力集合，使用方可以替换整条工具栏或部分标注分组。
const editorSlotScope = computed(() => ({
  annotations: annotationsState,
  style: styleState,
  editorBox: editorBoxState,
  preview: previewState,
  screenshot,
  requestCutImages,
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
  textAlign: styleState.textAlign,
  justifyContent: hasEditorScroll.value
    ? 'flex-start'
    : normalizeVerticalAlign(styleState.verticalAlign),
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

function applyHtmlToEditor(html) {
  // 父组件传入新的 html 时，只替换编辑区内容本身；
  // 后续预览、切图和 v-model 回抛仍统一走 syncPreviewSource。
  if (!editorContentRef.value) {
    return
  }

  const nextHtml = sanitizePreviewHtml(html)

  if (editorContentRef.value.innerHTML !== nextHtml) {
    clearSelectionPreview()
    selectionStore.setRange(null)
    editorContentRef.value.innerHTML = nextHtml
  }

  syncPreviewSource()
  syncEditorScrollState()
}

function saveSelection() {
  // 在鼠标抬起、键盘选择或重新聚焦后缓存选区。
  // 同时刷新工具栏回显、预览 HTML 和滚动状态。
  clearSelectionPreview()
  selectionStore.saveRange(editorContentRef.value)
  syncToolbarFromSelection()
  syncPreviewSource()
  syncEditorScrollState()
}

function applyStyleToSelection() {
  // 将当前工具栏状态应用到缓存选区。
  // 如果命中的是同一个 span，则直接改样式；
  // 如果是跨节点选区，则抽取内容后重新包裹一个 span。
  const range = selectionStore.getRange(editorContentRef.value)?.cloneRange()
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
  selectionStore.setRange(nextRange)
  setSelectionPreview(span)

  nextTick(() => {
    if (editorContentRef.value) {
      normalize(editorContentRef.value)
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
    if (editorContentRef.value) {
      sanitizeEditorContent()
      normalize(editorContentRef.value)
      selectionStore.saveRange(editorContentRef.value)
      syncToolbarFromSelection()
      syncPreviewSource()
      syncEditorScrollState()
    }
  })
}

function syncToolbarFromSelection() {
  // 从当前选区命中的节点反向读取计算样式，并写回工具栏状态。
  const range = selectionStore.getRange(editorContentRef.value)
  if (!editorContentRef.value || !range) {
    return
  }

  const target = getSelectionStyleTarget(range, editorContentRef.value)
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
  editorContentRef.value
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
  // 单行预览需要把换行转成空格占位，避免真正换行；
  // 同时把最新 HTML 通过 v-model:html 回抛给插件引入处。
  if (!editorContentRef.value) {
    return
  }

  const html = sanitizePreviewHtml(editorContentRef.value.innerHTML)

  previewSource.value = {
    html,
    singleLineHtml: html.replace(/<br\s*\/?>/gi, '<span> </span>'),
  }

  if (html !== props.html) {
    emit('update:html', html)
  }
}

function sanitizePreviewHtml(value) {
  // 预览与切图只允许编辑器支持的 span/br 结构和白名单样式。
  return sanitizeEditorHtml(value)
}

function sanitizeEditorContent() {
  if (!editorContentRef.value) {
    return
  }

  const sanitizedHtml = sanitizePreviewHtml(editorContentRef.value.innerHTML)
  if (editorContentRef.value.innerHTML !== sanitizedHtml) {
    clearSelectionPreview()
    selectionStore.setRange(null)
    editorContentRef.value.innerHTML = sanitizedHtml
  }
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

function normalizeVerticalAlign(value) {
  if (value === 'flex-start' || value === 'center' || value === 'flex-end') {
    return value
  }

  return 'center'
}

function normalizeDimension(value, fallback) {
  // 宽高限制在可用范围内，避免编辑区过小或生成超大画布。
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.min(MAX_EDITOR_DIMENSION, Math.max(MIN_EDITOR_DIMENSION, Math.round(number)))
}

function normalizeSpacing(value, fallback) {
  // 内边距统一做非负整数约束，并限制极端值对布局的影响。
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.min(MAX_EDITOR_PADDING, Math.max(0, Math.round(number)))
}

async function screenshot() {
  // 插件公开的截图方法：触发预览组件生成 PNG，
  // 并把每张图的索引、宽高和 File 对象抛给引入处。
  const images = (await previewPanelRef.value?.generateCutImages?.()) ?? []
  const payloads = images.map((image) => ({
    index: image.index,
    width: image.width,
    height: image.height,
    file: image.file,
    url: image.url,
    id: image.id,
    label: image.label,
  }))

  payloads.forEach((payload) => emit('screenshot', payload))
  emit('screenshots', payloads)

  return payloads
}

function requestCutImages() {
  // 工具栏按钮和外部实例方法共用同一条截图链路。
  screenshot()
}

defineExpose({
  screenshot,
  generateScreenshots: screenshot,
  requestCutImages,
})

onMounted(() => {
  // 初次挂载时先把外部 html 入参写入 contenteditable，再建立预览同源数据。
  applyHtmlToEditor(props.html)
})

watch(
  () => props.html,
  (nextHtml) => {
    // 外部主动替换 html 时，编辑区、预览区和切图区都以这份新内容为准。
    const normalizedHtml = sanitizePreviewHtml(nextHtml)
    const currentHtml = sanitizePreviewHtml(editorContentRef.value?.innerHTML ?? '')

    if (normalizedHtml === currentHtml) {
      if (normalizedHtml !== String(nextHtml ?? '')) {
        emit('update:html', normalizedHtml)
      }
      return
    }

    applyHtmlToEditor(normalizedHtml)
  },
)

watch(
  () => props.annotations,
  (nextAnnotations) => {
    // 外部更新统一标注对象时，合并回内部三段响应式状态。
    isPatchingAnnotationsFromProps = true
    patchTextEditorAnnotations(annotationsState, nextAnnotations)
    nextTick(() => {
      isPatchingAnnotationsFromProps = false
    })
  },
  { deep: true },
)

watch(
  annotationsState,
  () => {
    // 插件内部任一标注字段变化，都通过 v-model:annotations 回抛完整快照。
    if (isPatchingAnnotationsFromProps) {
      return
    }

    emit('update:annotations', cloneTextEditorAnnotations(annotationsState))
  },
  { deep: true },
)

watch(
  previewState,
  () => {
    // 统一约束预览相关的数值输入范围，避免非法值进入后续布局逻辑。
    Object.assign(previewState, normalizePreviewConfig(previewState))
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
      <slot name="toolbar" v-bind="editorSlotScope">
        <ToolbarPanel :annotations="annotationsState" @cut-images="requestCutImages">
          <template v-if="$slots['annotation-actions']" #annotation-actions="slotProps">
            <slot name="annotation-actions" v-bind="slotProps" />
          </template>
          <template v-if="$slots['annotation-font']" #annotation-font="slotProps">
            <slot name="annotation-font" v-bind="slotProps" />
          </template>
          <template v-if="$slots['annotation-fill']" #annotation-fill="slotProps">
            <slot name="annotation-fill" v-bind="slotProps" />
          </template>
          <template v-if="$slots['annotation-stroke']" #annotation-stroke="slotProps">
            <slot name="annotation-stroke" v-bind="slotProps" />
          </template>
          <template v-if="$slots['annotation-spacing']" #annotation-spacing="slotProps">
            <slot name="annotation-spacing" v-bind="slotProps" />
          </template>
          <template v-if="$slots['annotation-align']" #annotation-align="slotProps">
            <slot name="annotation-align" v-bind="slotProps" />
          </template>
          <template v-if="$slots['annotation-box']" #annotation-box="slotProps">
            <slot name="annotation-box" v-bind="slotProps" />
          </template>
          <template v-if="$slots['annotation-preview']" #annotation-preview="slotProps">
            <slot name="annotation-preview" v-bind="slotProps" />
          </template>
        </ToolbarPanel>
      </slot>

      <!-- 编辑舞台负责承载编辑区本体。 -->
      <div class="editor-stage">
        <div class="editor-panel" :style="{ width: editorBoxStyle.width, height: editorBoxStyle.height }">
          <div
            ref="editorRef"
            class="editor"
            :style="editorBoxStyle"
            @scroll="syncEditorScrollState"
          >
            <div
              ref="editorContentRef"
              class="editor-content"
              contenteditable="true"
              spellcheck="false"
              @mouseup="saveSelection"
              @keyup="saveSelection"
              @focus="saveSelection"
              @input="onInput"
            ></div>
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
  box-sizing: border-box;
  overflow: auto;
  display: flex;
  flex-direction: column;
  border-radius: 20px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  background: white;
  font-size: 24px;
  /* 给未显式包裹 span 的初始文本一个稳定默认字体，和预览区、切图区保持同源。 */
  font-family: 'Source Han Sans SC', 'Source Han Sans CN', 'Noto Sans CJK SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.editor-content {
  width: 100%;
  min-height: fit-content;
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
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
.editor:focus-within {
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
    font-size: 20px;
  }
}
</style>
