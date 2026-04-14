<script setup>
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

const editorRef = ref(null)
const isSyncingToolbar = ref(false)
const previewSource = ref({
  html: '',
  singleLineHtml: '',
})

const editorStyle = computed(() => ({
  textAlign: styleState.textAlign,
  alignItems: styleState.verticalAlign,
}))

const editorBoxMetrics = computed(() => ({
  width: normalizeDimension(editorBoxState.width, DEFAULT_EDITOR_BOX_STATE.width),
  height: normalizeDimension(editorBoxState.height, DEFAULT_EDITOR_BOX_STATE.height),
  paddingTop: normalizeSpacing(editorBoxState.paddingTop, DEFAULT_EDITOR_BOX_STATE.paddingTop),
  paddingRight: normalizeSpacing(editorBoxState.paddingRight, DEFAULT_EDITOR_BOX_STATE.paddingRight),
  paddingBottom: normalizeSpacing(editorBoxState.paddingBottom, DEFAULT_EDITOR_BOX_STATE.paddingBottom),
  paddingLeft: normalizeSpacing(editorBoxState.paddingLeft, DEFAULT_EDITOR_BOX_STATE.paddingLeft),
}))

const editorBoxStyle = computed(() => ({
  width: `${editorBoxMetrics.value.width}px`,
  height: `${editorBoxMetrics.value.height}px`,
  paddingTop: `${editorBoxMetrics.value.paddingTop}px`,
  paddingRight: `${editorBoxMetrics.value.paddingRight}px`,
  paddingBottom: `${editorBoxMetrics.value.paddingBottom}px`,
  paddingLeft: `${editorBoxMetrics.value.paddingLeft}px`,
}))

function saveSelection() {
  clearSelectionPreview()
  saveRange(editorRef.value)
  syncToolbarFromSelection()
  syncPreviewSource()
}

function applyStyleToSelection() {
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
    }
  })
}

function onInput() {
  nextTick(() => {
    if (editorRef.value) {
      normalize(editorRef.value)
      saveRange(editorRef.value)
      syncToolbarFromSelection()
      syncPreviewSource()
    }
  })
}

function syncToolbarFromSelection() {
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
  isSyncingToolbar.value = true
  Object.assign(styleState, nextState)
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
  editorRef.value
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

function syncPreviewSource() {
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
  return String(value ?? '')
    .replace(/\sdata-selection-preview="true"/g, '')
    .replace(/\sdata-selection-preview='true'/g, '')
}

function normalizeDimension(value, fallback) {
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.max(120, Math.round(number))
}

function normalizeSpacing(value, fallback) {
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.max(0, Math.round(number))
}

onMounted(() => {
  syncPreviewSource()
})

watch(
  previewState,
  () => {
    previewState.pageStaySeconds = Math.min(
      9999,
      Math.max(1, Number.parseInt(previewState.pageStaySeconds, 10) || DEFAULT_PREVIEW_STATE.pageStaySeconds),
    )
    previewState.singleLineSpeed = Math.min(
      9,
      Math.max(1, Number.parseInt(previewState.singleLineSpeed, 10) || DEFAULT_PREVIEW_STATE.singleLineSpeed),
    )
  },
  { deep: true },
)

watch(
  styleState,
  () => {
    if (isSyncingToolbar.value) {
      return
    }

    applyStyleToSelection()
  },
  { deep: true, flush: 'sync' },
)
</script>

<template>
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
      <ToolbarPanel />

      <div class="editor-stage" :style="editorStyle">
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
        >
          Select this text first, then change the toolbar settings to apply font size,
          colors, stroke, letter spacing, and line height instantly.
        </div>
      </div>

      <PreviewPanel
        :box-metrics="editorBoxMetrics"
        :content-html="previewSource.html"
        :single-line-html="previewSource.singleLineHtml"
        :preview-config="previewState"
        :text-align="styleState.textAlign"
      />
    </section>
  </main>
</template>

<style scoped>
.editor-shell {
  width: 1200px;
  margin: 0 auto;
  padding: 48px 0 56px;
}

.intro-card,
.workspace-card {
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(18px);
  box-shadow: 0 24px 80px rgba(34, 49, 74, 0.12);
}

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
  justify-content: center;
}

.editor {
  width: 960px;
  height: 540px;
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

.editor::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.editor:hover {
  scrollbar-width: thin;
}

.editor:hover::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.editor:hover::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(24, 33, 47, 0.28);
}

.editor:hover::-webkit-scrollbar-track {
  background: transparent;
}

.editor :deep([data-selection-preview='true']) {
  border-radius: 4px;
  box-shadow: inset 0 -1.1em rgba(54, 107, 255, 0.2);
}

.editor:focus {
  border-color: rgba(54, 107, 255, 0.35);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    0 0 0 4px rgba(54, 107, 255, 0.12);
}

@media (max-width: 720px) {
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
