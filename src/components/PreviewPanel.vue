<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  contentHtml: {
    type: String,
    default: '',
  },
  singleLineHtml: {
    type: String,
    default: '',
  },
  boxMetrics: {
    type: Object,
    required: true,
  },
  previewConfig: {
    type: Object,
    required: true,
  },
  textAlign: {
    type: String,
    default: 'left',
  },
  verticalAlign: {
    type: String,
    default: 'center',
  },
})

const multilineMeasureRef = ref(null)
const singleMeasureRef = ref(null)

const pagesHtml = ref(['&nbsp;'])
const currentPage = ref(0)
const hasTruncatedPages = ref(false)

const singleOffset = ref(0)
const singleRawWidth = ref(0)

const transitionState = ref({
  active: false,
  phase: 'idle',
  from: 0,
  to: 0,
  direction: 'static',
})

let pageTimerId = 0
let transitionTimerId = 0
let animationFrameId = 0

const normalizedVerticalAlign = computed(() => normalizeVerticalAlign(props.verticalAlign))

const previewPageStyle = computed(() => ({
  width: `${props.boxMetrics.width}px`,
  height: `${props.boxMetrics.height}px`,
  paddingTop: `${props.boxMetrics.paddingTop}px`,
  paddingRight: `${props.boxMetrics.paddingRight}px`,
  paddingBottom: `${props.boxMetrics.paddingBottom}px`,
  paddingLeft: `${props.boxMetrics.paddingLeft}px`,
  textAlign: props.textAlign,
}))

const singleLineViewportStyle = computed(() => ({
  ...previewPageStyle.value,
  alignItems: normalizedVerticalAlign.value,
}))

const safeContentHtml = computed(() => props.contentHtml || '&nbsp;')
const safeSingleLineHtml = computed(() => props.singleLineHtml || '&nbsp;')

const visiblePageCount = computed(() => pagesHtml.value.length)
const multilinePageText = computed(() => `${Math.min(currentPage.value + 1, visiblePageCount.value)} / ${visiblePageCount.value}`)

const activeMultilinePages = computed(() => {
  if (!transitionState.value.active) {
    return [
      {
        key: `page-${currentPage.value}`,
        html: pagesHtml.value[currentPage.value] ?? '&nbsp;',
        layerStyle: getTransitionLayerStyle('idle'),
        contentStyle: getMultilineContentStyle(currentPage.value),
      },
    ]
  }

  return [
    {
      key: `from-${transitionState.value.from}-${transitionState.value.phase}`,
      html: pagesHtml.value[transitionState.value.from] ?? '&nbsp;',
      layerStyle: getTransitionLayerStyle('from'),
      contentStyle: getMultilineContentStyle(transitionState.value.from),
    },
    {
      key: `to-${transitionState.value.to}-${transitionState.value.phase}`,
      html: pagesHtml.value[transitionState.value.to] ?? '&nbsp;',
      layerStyle: getTransitionLayerStyle('to'),
      contentStyle: getMultilineContentStyle(transitionState.value.to),
    },
  ]
})

const singleEffectiveWidth = computed(() => Math.min(singleRawWidth.value, 65536))
const singleSliceCount = computed(() => Math.max(1, Math.ceil(singleEffectiveWidth.value / 8096)))
const singleIsTruncated = computed(() => singleRawWidth.value > 65536)
const singleCopies = computed(() => (props.previewConfig.singleLineSeamless ? [0, 1, 2] : [0]))

const singleTrackStyle = computed(() => {
  if (props.previewConfig.singleLineMode === 'static') {
    return {
      transform: 'translateX(0px)',
    }
  }

  if (props.previewConfig.singleLineSeamless) {
    const baseOffset =
      props.previewConfig.singleLineMode === 'left'
        ? -singleEffectiveWidth.value - singleOffset.value
        : -singleEffectiveWidth.value + singleOffset.value

    return {
      transform: `translateX(${baseOffset}px)`,
    }
  }

  return {
    transform: `translateX(${singleOffset.value}px)`,
  }
})

watch(
  () => [
    props.contentHtml,
    props.singleLineHtml,
    props.textAlign,
    props.boxMetrics.width,
    props.boxMetrics.height,
    props.boxMetrics.paddingTop,
    props.boxMetrics.paddingRight,
    props.boxMetrics.paddingBottom,
    props.boxMetrics.paddingLeft,
    props.previewConfig.format,
    props.previewConfig.pageTransitionDirection,
    props.previewConfig.pageTransitionMs,
    props.previewConfig.pageStaySeconds,
    props.previewConfig.singleLineMode,
    props.previewConfig.singleLineSpeed,
    props.previewConfig.singleLineSeamless,
  ],
  async () => {
    currentPage.value = 0
    singleOffset.value = 0
    resetTransitionState()

    await nextTick()
    paginateMultilineContent()
    measureSingleLineWidth()
    restartMultilineAutoplay()
    restartSingleLineAnimation()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopMultilineAutoplay()
  stopPageTransition()
  stopSingleLineAnimation()
})

function paginateMultilineContent() {
  if (!multilineMeasureRef.value) {
    pagesHtml.value = ['&nbsp;']
    hasTruncatedPages.value = false
    return
  }

  const tokens = tokenizeHtml(safeContentHtml.value)
  const pages = []
  let currentTokens = []
  hasTruncatedPages.value = false

  if (tokens.length === 0) {
    pagesHtml.value = ['&nbsp;']
    return
  }

  for (let index = 0; index < tokens.length; index += 1) {
    currentTokens.push(tokens[index])
    multilineMeasureRef.value.innerHTML = renderTokens(currentTokens)

    if (isMeasureOverflowing(multilineMeasureRef.value)) {
      const overflowToken = currentTokens.pop()
      multilineMeasureRef.value.innerHTML = renderTokens(currentTokens)
      pages.push(multilineMeasureRef.value.innerHTML || '&nbsp;')

      if (pages.length >= 10) {
        hasTruncatedPages.value = true
        break
      }

      currentTokens = overflowToken ? [overflowToken] : []
      multilineMeasureRef.value.innerHTML = renderTokens(currentTokens)

      if (currentTokens.length && isMeasureOverflowing(multilineMeasureRef.value)) {
        pages.push(multilineMeasureRef.value.innerHTML || '&nbsp;')
        currentTokens = []

        if (pages.length >= 10 && index < tokens.length - 1) {
          hasTruncatedPages.value = true
          break
        }
      }
    }

    if (pages.length >= 10 && index < tokens.length - 1) {
      hasTruncatedPages.value = true
      break
    }
  }

  if (!hasTruncatedPages.value && currentTokens.length && pages.length < 10) {
    pages.push(renderTokens(currentTokens) || '&nbsp;')
  }

  pagesHtml.value = pages.length ? pages : ['&nbsp;']

  if (currentPage.value >= pagesHtml.value.length) {
    currentPage.value = 0
  }
}

function tokenizeHtml(html) {
  const container = document.createElement('div')
  container.innerHTML = html

  const tokens = []
  walkNodes(container, '', tokens)
  return tokens
}

function walkNodes(node, inheritedStyle, tokens) {
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      Array.from(child.textContent ?? '').forEach((character) => {
        tokens.push({
          type: 'text',
          value: character,
          style: inheritedStyle,
        })
      })
      return
    }

    if (child.nodeType !== Node.ELEMENT_NODE) {
      return
    }

    if (child.tagName === 'BR') {
      tokens.push({ type: 'br' })
      return
    }

    const mergedStyle = mergeInlineStyles(inheritedStyle, child.getAttribute('style') ?? '')
    walkNodes(child, mergedStyle, tokens)
  })
}

function mergeInlineStyles(parentStyle, childStyle) {
  const map = new Map()

  serializeStyleEntries(parentStyle).forEach(([property, value]) => {
    map.set(property, value)
  })

  serializeStyleEntries(childStyle).forEach(([property, value]) => {
    map.set(property, value)
  })

  return [...map.entries()]
    .map(([property, value]) => `${property}: ${value}`)
    .join('; ')
}

function serializeStyleEntries(styleText) {
  return String(styleText ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(':')
      if (separator === -1) {
        return null
      }

      const property = entry.slice(0, separator).trim()
      const value = entry.slice(separator + 1).trim()
      return property && value ? [property, value] : null
    })
    .filter(Boolean)
}

function renderTokens(tokens) {
  let html = ''
  let buffer = ''
  let currentStyle = null

  tokens.forEach((token) => {
    if (token.type === 'br') {
      html += flushBufferedHtml(buffer, currentStyle)
      buffer = ''
      currentStyle = null
      html += '<br>'
      return
    }

    if (token.style !== currentStyle) {
      html += flushBufferedHtml(buffer, currentStyle)
      buffer = ''
      currentStyle = token.style
    }

    buffer += escapeHtml(token.value)
  })

  html += flushBufferedHtml(buffer, currentStyle)

  return html
}

function flushBufferedHtml(buffer, styleText) {
  if (!buffer) {
    return ''
  }

  if (!styleText) {
    return buffer
  }

  return `<span style="${escapeAttribute(styleText)}">${buffer}</span>`
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
}

function isMeasureOverflowing(element) {
  return element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth
}

function restartMultilineAutoplay() {
  stopMultilineAutoplay()

  if (props.previewConfig.format !== 'multiline' || pagesHtml.value.length <= 1) {
    return
  }

  scheduleNextMultilineTurn()
}

function stopMultilineAutoplay() {
  if (!pageTimerId) {
    return
  }

  window.clearTimeout(pageTimerId)
  pageTimerId = 0
}

function goToPreviousPage() {
  if (pagesHtml.value.length <= 1 || transitionState.value.active) {
    return
  }

  goToPage((currentPage.value - 1 + pagesHtml.value.length) % pagesHtml.value.length)
}

function goToNextPage() {
  if (pagesHtml.value.length <= 1 || transitionState.value.active) {
    return
  }

  goToPage((currentPage.value + 1) % pagesHtml.value.length)
}

function goToPage(targetPage) {
  if (targetPage === currentPage.value || transitionState.value.active) {
    return
  }

  stopMultilineAutoplay()
  stopPageTransition()

  if (
    props.previewConfig.pageTransitionDirection === 'static' ||
    clampTransitionMs(props.previewConfig.pageTransitionMs) === 0
  ) {
    currentPage.value = targetPage
    restartMultilineAutoplay()
    return
  }

  transitionState.value = {
    active: true,
    phase: 'prepare',
    from: currentPage.value,
    to: targetPage,
    direction: props.previewConfig.pageTransitionDirection,
  }

  nextTick(() => {
    requestAnimationFrame(() => {
      transitionState.value = {
        ...transitionState.value,
        phase: 'running',
      }
    })
  })

  transitionTimerId = window.setTimeout(() => {
    currentPage.value = targetPage
    resetTransitionState()
    restartMultilineAutoplay()
  }, clampTransitionMs(props.previewConfig.pageTransitionMs))
}

function scheduleNextMultilineTurn() {
  pageTimerId = window.setTimeout(() => {
    pageTimerId = 0
    goToPage((currentPage.value + 1) % pagesHtml.value.length)
  }, clampPageStaySeconds(props.previewConfig.pageStaySeconds) * 1000)
}

function stopPageTransition() {
  if (transitionTimerId) {
    window.clearTimeout(transitionTimerId)
    transitionTimerId = 0
  }
}

function resetTransitionState() {
  stopPageTransition()
  transitionState.value = {
    active: false,
    phase: 'idle',
    from: currentPage.value,
    to: currentPage.value,
    direction: 'static',
  }
}

function getTransitionLayerStyle(layer) {
  const base = {
    ...previewPageStyle.value,
    transition: 'none',
  }

  if (!transitionState.value.active || layer === 'idle') {
    return {
      ...base,
      transform: 'translate3d(0, 0, 0)',
      zIndex: 1,
    }
  }

  const vector = getDirectionVector(transitionState.value.direction)

  if (layer === 'from') {
    return {
      ...base,
      transition: `transform ${clampTransitionMs(props.previewConfig.pageTransitionMs)}ms ease`,
      transform:
        transitionState.value.phase === 'running'
          ? `translate3d(${vector.x}, ${vector.y}, 0)`
          : 'translate3d(0, 0, 0)',
      zIndex: 2,
    }
  }

  return {
    ...base,
    transform: 'translate3d(0, 0, 0)',
    zIndex: 1,
  }
}

function getDirectionVector(direction) {
  if (direction === 'up') {
    return { x: '0%', y: '-100%' }
  }

  if (direction === 'down') {
    return { x: '0%', y: '100%' }
  }

  if (direction === 'right') {
    return { x: '100%', y: '0%' }
  }

  return { x: '-100%', y: '0%' }
}

function getMultilineContentStyle(pageIndex) {
  return {
    justifyContent:
      pageIndex === pagesHtml.value.length - 1 ? normalizedVerticalAlign.value : 'flex-start',
  }
}

function measureSingleLineWidth() {
  if (!singleMeasureRef.value) {
    singleRawWidth.value = 0
    return
  }

  singleRawWidth.value = Math.ceil(singleMeasureRef.value.scrollWidth)
}

function restartSingleLineAnimation() {
  stopSingleLineAnimation()

  if (
    props.previewConfig.format !== 'singleline' ||
    props.previewConfig.singleLineMode === 'static' ||
    singleEffectiveWidth.value <= 0
  ) {
    return
  }

  const speed = clampSingleLineSpeed(props.previewConfig.singleLineSpeed)

  animationFrameId = window.requestAnimationFrame(function tick() {
    if (props.previewConfig.singleLineSeamless) {
      singleOffset.value = (singleOffset.value + speed) % Math.max(1, singleEffectiveWidth.value)
    } else if (props.previewConfig.singleLineMode === 'left') {
      singleOffset.value -= speed

      if (singleOffset.value <= -singleEffectiveWidth.value) {
        singleOffset.value = props.boxMetrics.width
      }
    } else {
      singleOffset.value += speed

      if (singleOffset.value >= props.boxMetrics.width) {
        singleOffset.value = -singleEffectiveWidth.value
      }
    }

    animationFrameId = window.requestAnimationFrame(tick)
  })
}

function stopSingleLineAnimation() {
  if (!animationFrameId) {
    return
  }

  window.cancelAnimationFrame(animationFrameId)
  animationFrameId = 0
}

function clampPageStaySeconds(value) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number)) {
    return 10
  }

  return Math.min(9999, Math.max(1, number))
}

function clampTransitionMs(value) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number)) {
    return 100
  }

  return Math.max(0, number)
}

function clampSingleLineSpeed(value) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number)) {
    return 3
  }

  return Math.min(9, Math.max(1, number))
}

function normalizeVerticalAlign(value) {
  if (value === 'flex-start' || value === 'center' || value === 'flex-end') {
    return value
  }

  return 'center'
}
</script>

<template>
  <section class="preview-stage">
    <div class="preview-header">
      <div>
        <p class="preview-eyebrow">Preview</p>
        <h2>Live output</h2>
      </div>

      <div class="preview-meta">
        <span class="meta-chip">
          {{ previewConfig.format === 'multiline' ? 'Multiline' : 'Single line' }}
        </span>
        <span v-if="previewConfig.format === 'multiline'" class="meta-chip">
          {{ visiblePageCount }} page{{ visiblePageCount > 1 ? 's' : '' }}
        </span>
        <span v-else class="meta-chip">Slices {{ singleSliceCount }}</span>
      </div>
    </div>

    <div v-if="previewConfig.format === 'multiline'" class="preview-mode">
      <div class="preview-toolbar">
        <div class="toolbar-group">
          <button type="button" class="nav-button" @click="goToPreviousPage">Prev</button>
          <span class="page-counter">{{ multilinePageText }}</span>
          <button type="button" class="nav-button" @click="goToNextPage">Next</button>
        </div>

        <div class="toolbar-group info-group">
          <span>Motion {{ previewConfig.pageTransitionDirection }}</span>
          <span>Transition {{ previewConfig.pageTransitionMs }}ms</span>
          <span>Stay {{ previewConfig.pageStaySeconds }}s</span>
        </div>
      </div>

      <div
        class="preview-viewport preview-page-stack"
        :style="{ width: `${boxMetrics.width}px`, height: `${boxMetrics.height}px` }"
      >
        <div
          v-for="page in activeMultilinePages"
          :key="page.key"
          class="preview-page preview-page-layer"
          :style="page.layerStyle"
        >
          <div class="preview-page-content" :style="page.contentStyle">
            <div class="preview-page-copy" v-html="page.html" />
          </div>
        </div>
      </div>

      <div
        ref="multilineMeasureRef"
        class="preview-page preview-page-measure"
        :style="previewPageStyle"
        aria-hidden="true"
      />

      <p class="preview-note">
        Each page uses the current `Editor width`, `Editor height`, and all four padding values.
      </p>
      <p class="preview-note">
        Maximum 10 pages are supported in multiline preview.
      </p>
      <p v-if="hasTruncatedPages" class="preview-warning">
        Content exceeds 10 pages. Data after page 10 is discarded automatically.
      </p>
    </div>

    <div v-else class="preview-mode">
      <div class="preview-toolbar">
        <div class="toolbar-group">
          <span class="page-counter">
            {{
              previewConfig.singleLineMode === 'static'
                ? 'Static'
                : previewConfig.singleLineMode === 'left'
                  ? 'Move left'
                  : 'Move right'
            }}
          </span>
        </div>

        <div class="toolbar-group info-group">
          <span>Speed {{ previewConfig.singleLineSpeed }}px/frame</span>
          <span>{{ previewConfig.singleLineSeamless ? 'Seamless loop on' : 'Seamless loop off' }}</span>
        </div>
      </div>

      <div class="preview-viewport preview-singleline-viewport" :style="singleLineViewportStyle">
        <div class="single-line-track" :style="singleTrackStyle">
          <div
            v-for="copy in singleCopies"
            :key="copy"
            class="single-line-copy"
            v-html="safeSingleLineHtml"
          />
        </div>
        <div ref="singleMeasureRef" class="single-line-measure" v-html="safeSingleLineHtml" />
      </div>

      <p class="preview-note">
        Single line width is capped at 65536px and sliced in blocks of 8096px.
      </p>
      <p class="preview-note">
        Effective width {{ singleEffectiveWidth }}px, slices {{ singleSliceCount }}.
      </p>
      <p v-if="singleIsTruncated" class="preview-warning">
        Content exceeds 65536px. The overflowing part is discarded automatically.
      </p>
    </div>
  </section>
</template>

<style scoped>
.preview-stage {
  margin-top: 18px;
  padding: 20px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(18px);
  box-shadow: 0 24px 80px rgba(34, 49, 74, 0.12);
}

.preview-header,
.preview-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.preview-eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #b46619;
}

h2 {
  margin: 0;
  font-size: 24px;
  line-height: 1.1;
}

.preview-meta,
.toolbar-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.meta-chip,
.page-counter,
.info-group span {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(13, 20, 33, 0.05);
  color: #344256;
  font-size: 13px;
}

.preview-mode {
  margin-top: 16px;
}

.preview-toolbar {
  margin-bottom: 12px;
}

.preview-viewport {
  overflow: hidden;
  border-radius: 22px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  background: white;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.preview-page {
  box-sizing: border-box;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 24px;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  line-height: 1.5;
}

.preview-page-stack {
  position: relative;
}

.preview-page-layer {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: white;
  will-change: transform;
}

.preview-page-content {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
}

.preview-page-copy {
  width: 100%;
}

.preview-page-measure {
  position: absolute;
  left: -99999px;
  top: 0;
  visibility: hidden;
  overflow: hidden;
  pointer-events: none;
}

.preview-singleline-viewport {
  position: relative;
  display: flex;
  align-items: center;
  white-space: nowrap;
  font-size: 24px;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  line-height: 1.5;
}

.single-line-track {
  display: flex;
  align-items: center;
  gap: 0;
  will-change: transform;
}

.single-line-copy {
  flex: 0 0 auto;
  max-width: 65536px;
  overflow: hidden;
  white-space: nowrap;
  font-size: inherit;
  font-family: inherit;
  line-height: inherit;
}

.single-line-measure {
  position: absolute;
  inset: 0 auto auto -99999px;
  visibility: hidden;
  width: max-content;
  white-space: nowrap;
  pointer-events: none;
  font-size: inherit;
  font-family: inherit;
  line-height: inherit;
}

.single-line-copy :deep(br),
.single-line-measure :deep(br) {
  display: none;
}

.nav-button {
  min-width: 72px;
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid rgba(24, 33, 47, 0.12);
  border-radius: 999px;
  background: white;
  color: #18212f;
  font: inherit;
  cursor: pointer;
}

.preview-note,
.preview-warning {
  margin: 12px 0 0;
  font-size: 13px;
}

.preview-note {
  color: #5b6a7f;
}

.preview-warning {
  color: #b14f18;
}

@media (max-width: 720px) {
  .preview-stage {
    padding: 14px;
    border-radius: 22px;
  }

  .preview-viewport {
    max-width: 100%;
  }
}
</style>
