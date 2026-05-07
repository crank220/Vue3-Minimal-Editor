<script setup>
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import PreviewPanel from './PreviewPanel.vue'
import ToolbarPanel from './ToolbarPanel.vue'
import { createSelectionStore } from '../composables/useSelection'
import {
  createEditorBoxConfig,
  createPreviewConfig,
  createStyleConfig,
  createSurfaceTheme,
  DEFAULT_EDITOR_BOX_STATE,
  DEFAULT_PREVIEW_STATE,
  DEFAULT_STYLE_STATE,
  normalizeEditorBoxConfig,
  normalizePreviewConfig,
  normalizeStyleConfig,
  resolveFontFamily,
  styleToCss,
  toPlainState,
} from '../composables/useStyle'
import { normalize } from '../utils/normalize'

defineOptions({
  name: 'HdTextEditor',
})

const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  styleConfig: {
    type: Object,
    default: () => ({}),
  },
  editorBoxConfig: {
    type: Object,
    default: () => ({}),
  },
  previewConfig: {
    type: Object,
    default: () => ({}),
  },
  surfaceTheme: {
    type: Object,
    default: () => ({}),
  },
  showToolbar: {
    type: Boolean,
    default: true,
  },
  showCutPreview: {
    type: Boolean,
    default: true,
  },
  uiClassMap: {
    type: Object,
    default: () => ({}),
  },
  uiStyleMap: {
    type: Object,
    default: () => ({}),
  },
})

const emit = defineEmits([
  'update:modelValue',
  'update:styleConfig',
  'update:editorBoxConfig',
  'update:previewConfig',
  'update:surfaceTheme',
  'ready',
  'text-change',
  'selection-change',
  'editor-change',
  'cut-images',
])

// 插件内部全部切换为实例态。
// 这样无论 demo 里放几个编辑器，选区、工具栏和导出状态都不会串线。
const selectionStore = createSelectionStore()
const styleState = reactive(createStyleConfig(props.styleConfig))
const editorBoxState = reactive(createEditorBoxConfig(props.editorBoxConfig))
const previewState = reactive(createPreviewConfig(props.previewConfig, editorBoxState.width))
const surfaceThemeState = reactive(createSurfaceTheme(props.surfaceTheme))

const editorRef = ref(null)
const editorContentRef = ref(null)
const previewPanelRef = ref(null)
const isSyncingToolbar = ref(false)
const editorHtml = ref(normalizeEditorHtml(props.modelValue))
const previewSource = ref(buildPreviewSource(editorHtml.value))
const editorScrollState = ref({
  clientHeight: 0,
  scrollHeight: 0,
  scrollTop: 0,
})

const editorBoxMetrics = computed(() => normalizeEditorBoxConfig(editorBoxState))

// editor / preview-viewport / cut-preview-item 的基础外观走同一组 CSS 变量。
// 这样共享字体、圆角、背景和边框时，不需要在三处重复维护。
const surfaceThemeVars = computed(() => ({
  '--hdte-font-stack': surfaceThemeState.fontFamily,
  '--hdte-surface-font-size': `${surfaceThemeState.fontSize}px`,
  '--hdte-surface-line-height': surfaceThemeState.lineHeight,
  '--hdte-surface-background': surfaceThemeState.background,
  '--hdte-surface-border-color': surfaceThemeState.borderColor,
  '--hdte-surface-radius': `${surfaceThemeState.borderRadius}px`,
  '--hdte-surface-inset-shadow': surfaceThemeState.insetShadow,
}))

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

const hasEditorScroll = computed(
  () => editorScrollState.value.scrollHeight > editorScrollState.value.clientHeight + 1,
)

const editorScrollThumbStyle = computed(() => {
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
  clearSelectionPreview()
  selectionStore.saveRange(editorContentRef.value)
  syncToolbarFromSelection()
  syncPreviewSource()
  syncEditorScrollState()
  emitSelectionChange('user')
}

function applyStyleToSelection(source = 'toolbar') {
  const range = selectionStore.getRange()?.cloneRange()
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
    if (!editorContentRef.value) {
      return
    }

    normalize(editorContentRef.value)
    syncToolbarFromSelection()
    commitEditorHtml(source)
    syncEditorScrollState()
  })
}

function onInput() {
  nextTick(() => {
    if (!editorContentRef.value) {
      return
    }

    normalize(editorContentRef.value)
    selectionStore.saveRange(editorContentRef.value)
    syncToolbarFromSelection()
    commitEditorHtml('user')
    syncEditorScrollState()
  })
}

function syncToolbarFromSelection() {
  const range = selectionStore.getRange()
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
    textAlign: normalizeTextAlign(computedStyle.textAlign, DEFAULT_STYLE_STATE.textAlign),
  })
}

function patchStyleState(nextState) {
  isSyncingToolbar.value = true
  Object.assign(styleState, normalizeStyleConfig({ ...styleState, ...nextState }))
  isSyncingToolbar.value = false
}

function getSelectionStyleTarget(range, root) {
  const startElement = getElementFromNode(range.startContainer, root)
  if (startElement) {
    return startElement.closest('span') ?? startElement
  }

  return root
}

function getElementFromNode(node, root) {
  const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement
  if (!element || !root.contains(element)) {
    return root
  }

  return element
}

function getSelectedSpan(range) {
  const container = range.startContainer

  if (container === range.endContainer && container.nodeType === Node.ELEMENT_NODE) {
    if (
      container.tagName === 'SPAN' &&
      range.startOffset === 0 &&
      range.endOffset === container.childNodes.length
    ) {
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
  editorContentRef.value
    ?.querySelectorAll('[data-selection-preview="true"]')
    .forEach((element) => element.removeAttribute('data-selection-preview'))
}

function setSelectionPreview(element) {
  if (!element) {
    return
  }

  element.setAttribute('data-selection-preview', 'true')
}

function applyStrokeMeta(element) {
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
  const span = target?.closest?.('span') ?? (target?.tagName === 'SPAN' ? target : null)
  const computedStyle = window.getComputedStyle(target)

  if (!span?.dataset.strokeWidth) {
    return {
      strokeColor: parseColorValue(
        computedStyle.getPropertyValue('-webkit-text-stroke-color'),
        DEFAULT_STYLE_STATE.strokeColor,
      ),
      strokeWidth: parsePixelValue(
        computedStyle.getPropertyValue('-webkit-text-stroke-width'),
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
  if (!value || value === 'normal') {
    return fallback
  }

  const number = Number.parseFloat(value)
  return Number.isFinite(number) ? Number(number.toFixed(2)) : fallback
}

function parseLineHeight(value, fontSize, fallback) {
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
  if (value === 'bold') {
    return true
  }

  const weight = Number.parseInt(value, 10)
  return Number.isFinite(weight) && weight >= 600
}

function toHex(value) {
  return value.toString(16).padStart(2, '0')
}

// modelValue -> previewSource 是插件的数据主线。
// editor、preview 和 cut 都只围绕同一份 HTML 与同一份盒模型继续派生。
function syncPreviewSource(html = editorHtml.value) {
  previewSource.value = buildPreviewSource(html)
}

function buildPreviewSource(html) {
  const normalizedHtml = sanitizePreviewHtml(html)

  return {
    html: normalizedHtml,
    singleLineHtml: normalizedHtml.replace(/<br\s*\/?>/gi, '<span> </span>'),
  }
}

function sanitizePreviewHtml(value) {
  return String(value ?? '')
    .replace(/\sdata-selection-preview="true"/g, '')
    .replace(/\sdata-selection-preview='true'/g, '')
}

function normalizeEditorHtml(value) {
  return String(value ?? '')
}

function syncEditorScrollState() {
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

function normalizeTextAlign(value, fallback) {
  if (value === 'left' || value === 'center' || value === 'right' || value === 'justify') {
    return value
  }

  return fallback
}

async function requestCutImages() {
  try {
    await generateCutImages('toolbar')
  } catch {
    // 预览面板已经负责在界面里展示错误，这里只避免工具栏点击产生未处理 Promise。
  }
}

function readEditorHtml() {
  if (!editorContentRef.value) {
    return editorHtml.value
  }

  return sanitizePreviewHtml(editorContentRef.value.innerHTML)
}

function commitEditorHtml(source = 'api', { emitTextChange = true } = {}) {
  const html = readEditorHtml()
  editorHtml.value = html
  syncPreviewSource(html)

  emit('update:modelValue', html)

  if (emitTextChange) {
    const payload = {
      html,
      source,
      snapshot: getSnapshot(),
    }

    emit('text-change', payload)
    emit('editor-change', {
      eventName: 'text-change',
      payload,
    })
  }

  return html
}

function applyModelValue(html, { source = 'external', emitTextChange = false } = {}) {
  const normalizedHtml = normalizeEditorHtml(html)
  editorHtml.value = normalizedHtml

  if (editorContentRef.value && editorContentRef.value.innerHTML !== normalizedHtml) {
    editorContentRef.value.innerHTML = normalizedHtml
    normalize(editorContentRef.value)
  }

  selectionStore.clearRange()
  clearSelectionPreview()
  syncPreviewSource(readEditorHtml())
  syncEditorScrollState()

  if (emitTextChange) {
    commitEditorHtml(source)
  }
}

function emitSelectionChange(source = 'user') {
  const range = selectionStore.getRange()
  const payload = {
    source,
    hasSelection: Boolean(range),
    collapsed: range ? range.collapsed : true,
    snapshot: getSnapshot(),
  }

  emit('selection-change', payload)
  emit('editor-change', {
    eventName: 'selection-change',
    payload,
  })
}

function getSnapshot({ includeCutImages = false } = {}) {
  return {
    html: editorHtml.value,
    previewSource: {
      ...previewSource.value,
    },
    styleConfig: toPlainState(styleState),
    editorBoxConfig: toPlainState(editorBoxState),
    previewConfig: toPlainState(previewState),
    surfaceTheme: toPlainState(surfaceThemeState),
    cutImages: includeCutImages ? getCutImages() : [],
  }
}

async function generateCutImages(source = 'api') {
  const payload = await previewPanelRef.value?.generateCutImages?.()
  if (!payload) {
    return {
      images: [],
      source,
      snapshot: getSnapshot(),
    }
  }

  const eventPayload = {
    ...payload,
    html: editorHtml.value,
    source,
    snapshot: getSnapshot({ includeCutImages: true }),
  }

  emit('cut-images', eventPayload)
  return eventPayload
}

function getCutImages() {
  return previewPanelRef.value?.getCutImagePreviews?.() ?? []
}

function getHtml() {
  return editorHtml.value
}

function setHtml(html, source = 'api') {
  applyModelValue(html, {
    source,
    emitTextChange: true,
  })
  return editorHtml.value
}

function focus() {
  editorContentRef.value?.focus()
  saveSelection()
}

function blur() {
  editorContentRef.value?.blur()
}

function setConfigs(nextConfig = {}) {
  if (nextConfig.styleConfig) {
    Object.assign(styleState, createStyleConfig(nextConfig.styleConfig))
  }

  if (nextConfig.editorBoxConfig) {
    Object.assign(editorBoxState, createEditorBoxConfig(nextConfig.editorBoxConfig))
  }

  if (nextConfig.previewConfig) {
    Object.assign(
      previewState,
      createPreviewConfig(nextConfig.previewConfig, editorBoxMetrics.value.width),
    )
  }

  if (nextConfig.surfaceTheme) {
    Object.assign(surfaceThemeState, createSurfaceTheme(nextConfig.surfaceTheme))
  }
}

defineExpose({
  focus,
  blur,
  getHtml,
  setHtml,
  setConfigs,
  getSnapshot,
  generateCutImages,
  getCutImages,
})

// 外部 props 变化时，只同步进当前实例，不直接复用外部对象引用。
watch(
  () => props.styleConfig,
  (nextState) => {
    Object.assign(styleState, createStyleConfig(nextState))
  },
  { deep: true, immediate: true },
)

watch(
  () => props.editorBoxConfig,
  (nextState) => {
    Object.assign(editorBoxState, createEditorBoxConfig(nextState))
  },
  { deep: true, immediate: true },
)

watch(
  () => props.previewConfig,
  (nextState) => {
    Object.assign(previewState, createPreviewConfig(nextState, editorBoxMetrics.value.width))
  },
  { deep: true, immediate: true },
)

watch(
  () => props.surfaceTheme,
  (nextState) => {
    Object.assign(surfaceThemeState, createSurfaceTheme(nextState))
  },
  { deep: true, immediate: true },
)

watch(
  () => props.modelValue,
  (nextHtml) => {
    const normalizedHtml = normalizeEditorHtml(nextHtml)
    if (normalizedHtml === editorHtml.value) {
      return
    }

    applyModelValue(normalizedHtml)
  },
  { immediate: true },
)

// styleConfig / box / preview / surface 的本地变化都会向外发出更新事件。
watch(
  styleState,
  () => {
    const normalized = normalizeStyleConfig(styleState)
    if (patchObject(styleState, normalized)) {
      return
    }

    emit('update:styleConfig', toPlainState(styleState))
    if (isSyncingToolbar.value) {
      return
    }

    applyStyleToSelection('toolbar')
  },
  { deep: true, flush: 'sync' },
)

watch(
  editorBoxState,
  () => {
    const normalized = normalizeEditorBoxConfig(editorBoxState)
    if (patchObject(editorBoxState, normalized)) {
      return
    }

    previewState.cutImageWidth = Math.min(previewState.cutImageWidth, 65536)
    emit('update:editorBoxConfig', toPlainState(editorBoxState))

    nextTick(() => {
      syncEditorScrollState()
    })
  },
  { deep: true },
)

watch(
  previewState,
  () => {
    const normalized = normalizePreviewConfig(previewState, editorBoxMetrics.value.width)
    if (patchObject(previewState, normalized)) {
      return
    }

    emit('update:previewConfig', toPlainState(previewState))
  },
  { deep: true },
)

watch(
  surfaceThemeState,
  () => {
    const normalized = createSurfaceTheme(surfaceThemeState)
    if (patchObject(surfaceThemeState, normalized)) {
      return
    }

    emit('update:surfaceTheme', toPlainState(surfaceThemeState))
  },
  { deep: true },
)

watch(
  editorBoxMetrics,
  () => {
    nextTick(() => {
      syncEditorScrollState()
    })
  },
  { deep: true },
)

onMounted(async () => {
  applyModelValue(editorHtml.value)
  await nextTick()
  syncEditorScrollState()
  emit('ready', {
    api: {
      focus,
      blur,
      getHtml,
      setHtml,
      setConfigs,
      getSnapshot,
      generateCutImages,
      getCutImages,
    },
    snapshot: getSnapshot(),
  })
})

function patchObject(target, nextState) {
  let changed = false

  Object.entries(nextState).forEach(([key, value]) => {
    if (target[key] !== value) {
      target[key] = value
      changed = true
    }
  })

  return changed
}
</script>

<template>
  <main
    :class="['editor-shell', 'hd-text-editor', uiClassMap.root]"
    :style="[surfaceThemeVars, uiStyleMap.root]"
  >
    <section
      :class="['workspace-card', uiClassMap.workspace]"
      :style="uiStyleMap.workspace"
    >
      <ToolbarPanel
        v-if="showToolbar"
        :style-state="styleState"
        :editor-box-state="editorBoxState"
        :preview-state="previewState"
        :ui-class-map="uiClassMap"
        :ui-style-map="uiStyleMap"
        @cut-images="requestCutImages"
      />

      <div
        :class="['editor-stage', uiClassMap.editorStage]"
        :style="uiStyleMap.editorStage"
      >
        <div class="editor-panel" :style="{ width: editorBoxStyle.width, height: editorBoxStyle.height }">
          <div
            ref="editorRef"
            :class="['editor', uiClassMap.editor]"
            :style="[editorBoxStyle, uiStyleMap.editor]"
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

      <PreviewPanel
        ref="previewPanelRef"
        :box-metrics="editorBoxMetrics"
        :content-html="previewSource.html"
        :single-line-html="previewSource.singleLineHtml"
        :preview-config="previewState"
        :text-align="styleState.textAlign"
        :vertical-align="styleState.verticalAlign"
        :show-cut-preview="showCutPreview"
        :ui-class-map="uiClassMap"
        :ui-style-map="uiStyleMap"
      />
    </section>
  </main>
</template>

<style scoped>
.editor-shell {
  width: min(1200px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 32px 0 56px;
}

.workspace-card {
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(18px);
  box-shadow: 0 24px 80px rgba(34, 49, 74, 0.12);
  padding: 20px;
}

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

.editor-panel {
  position: relative;
}

/* editor 默认字体、圆角、背景和边框都走共享变量，和 preview / cut 保持同源。 */
.editor {
  box-sizing: border-box;
  overflow: auto;
  display: flex;
  flex-direction: column;
  border-radius: var(--hdte-surface-radius, 20px);
  border: 1px solid var(--hdte-surface-border-color, rgba(24, 33, 47, 0.08));
  background: var(--hdte-surface-background, #ffffff);
  font-size: var(--hdte-surface-font-size, 24px);
  font-family: var(--hdte-font-stack, 'Source Han Sans SC', 'Source Han Sans CN', 'Noto Sans CJK SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif);
  line-height: var(--hdte-surface-line-height, 1.5);
  box-shadow: var(--hdte-surface-inset-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.8));
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

.editor::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.editor :deep([data-selection-preview='true']) {
  border-radius: 4px;
  box-shadow: inset 0 -1.1em rgba(54, 107, 255, 0.2);
}

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

.editor-panel:hover .editor-scrollbar {
  opacity: 1;
}

.editor-scrollbar-thumb {
  width: 100%;
  border-radius: 999px;
  background: rgba(24, 33, 47, 0.28);
}

.editor:focus-within {
  border-color: rgba(54, 107, 255, 0.35);
  box-shadow:
    var(--hdte-surface-inset-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.8)),
    0 0 0 4px rgba(54, 107, 255, 0.12);
}

@media (max-width: 720px) {
  .editor-shell {
    width: min(100vw - 20px, 1120px);
    padding: 20px 0 28px;
  }

  .workspace-card {
    border-radius: 22px;
    padding: 14px;
  }

  .editor-stage {
    border-radius: 18px;
  }
}
</style>
