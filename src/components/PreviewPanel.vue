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
})

const multilineFlowRef = ref(null)
const singleMeasureRef = ref(null)
const currentPage = ref(0)
const totalPageCount = ref(1)
const singleOffset = ref(0)
const singleRawWidth = ref(0)

let pageTimerId = 0
let animationFrameId = 0

const previewPageStyle = computed(() => ({
  width: `${props.boxMetrics.width}px`,
  height: `${props.boxMetrics.height}px`,
  paddingTop: `${props.boxMetrics.paddingTop}px`,
  paddingRight: `${props.boxMetrics.paddingRight}px`,
  paddingBottom: `${props.boxMetrics.paddingBottom}px`,
  paddingLeft: `${props.boxMetrics.paddingLeft}px`,
  textAlign: props.textAlign,
}))

const multilineContentWidth = computed(() =>
  Math.max(1, props.boxMetrics.width - props.boxMetrics.paddingLeft - props.boxMetrics.paddingRight),
)

const multilineFlowStyle = computed(() => ({
  ...previewPageStyle.value,
  columnWidth: `${multilineContentWidth.value}px`,
  columnGap: '0px',
  transform: `translateX(-${currentPage.value * props.boxMetrics.width}px)`,
  transitionDuration: `${props.previewConfig.pageTransitionMs}ms`,
}))

const visiblePageCount = computed(() => Math.min(totalPageCount.value, 10))
const droppedPageCount = computed(() => Math.max(0, totalPageCount.value - 10))
const multilinePageText = computed(() => `${Math.min(currentPage.value + 1, visiblePageCount.value)} / ${visiblePageCount.value}`)

const safeContentHtml = computed(() => props.contentHtml || '&nbsp;')
const safeSingleLineHtml = computed(() => props.singleLineHtml || '&nbsp;')

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
    props.previewConfig.pageTransitionMs,
    props.previewConfig.pageStaySeconds,
    props.previewConfig.singleLineMode,
    props.previewConfig.singleLineSpeed,
    props.previewConfig.singleLineSeamless,
  ],
  async () => {
    currentPage.value = 0
    singleOffset.value = 0

    await nextTick()
    measureMultilinePages()
    measureSingleLineWidth()
    restartSingleLineAnimation()
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  stopMultilineAutoplay()
  stopSingleLineAnimation()
})

function measureMultilinePages() {
  if (!multilineFlowRef.value) {
    totalPageCount.value = 1
    return
  }

  const pageWidth = multilineFlowRef.value.clientWidth || props.boxMetrics.width
  const scrollWidth = multilineFlowRef.value.scrollWidth || pageWidth
  totalPageCount.value = Math.max(1, Math.ceil(scrollWidth / pageWidth))

  if (currentPage.value >= visiblePageCount.value) {
    currentPage.value = 0
  }

  restartMultilineAutoplay()
}

function measureSingleLineWidth() {
  if (!singleMeasureRef.value) {
    singleRawWidth.value = 0
    return
  }

  singleRawWidth.value = Math.ceil(singleMeasureRef.value.scrollWidth)
}

function restartMultilineAutoplay() {
  stopMultilineAutoplay()

  if (props.previewConfig.format !== 'multiline' || visiblePageCount.value <= 1) {
    return
  }

  const delay = clampPageStaySeconds(props.previewConfig.pageStaySeconds) * 1000 + props.previewConfig.pageTransitionMs

  pageTimerId = window.setInterval(() => {
    currentPage.value = (currentPage.value + 1) % visiblePageCount.value
  }, delay)
}

function stopMultilineAutoplay() {
  if (!pageTimerId) {
    return
  }

  window.clearInterval(pageTimerId)
  pageTimerId = 0
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

function goToPreviousPage() {
  if (visiblePageCount.value <= 1) {
    return
  }

  currentPage.value = (currentPage.value - 1 + visiblePageCount.value) % visiblePageCount.value
  restartMultilineAutoplay()
}

function goToNextPage() {
  if (visiblePageCount.value <= 1) {
    return
  }

  currentPage.value = (currentPage.value + 1) % visiblePageCount.value
  restartMultilineAutoplay()
}

function clampPageStaySeconds(value) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number)) {
    return 10
  }

  return Math.min(9999, Math.max(1, number))
}

function clampSingleLineSpeed(value) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number)) {
    return 3
  }

  return Math.min(9, Math.max(1, number))
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
          <span>Transition {{ previewConfig.pageTransitionMs }}ms</span>
          <span>Stay {{ previewConfig.pageStaySeconds }}s</span>
        </div>
      </div>

      <div class="preview-viewport" :style="{ width: `${boxMetrics.width}px`, height: `${boxMetrics.height}px` }">
        <div ref="multilineFlowRef" class="preview-page preview-flow" :style="multilineFlowStyle" v-html="safeContentHtml" />
      </div>

      <p class="preview-note">
        Each page matches `Editor width` and `Editor height`. Maximum 10 pages are available in preview.
      </p>
      <p v-if="droppedPageCount > 0" class="preview-warning">
        Content exceeds 10 pages. The extra {{ droppedPageCount }} page{{ droppedPageCount > 1 ? 's are' : ' is' }} discarded automatically.
      </p>
    </div>

    <div v-else class="preview-mode">
      <div class="preview-toolbar">
        <div class="toolbar-group">
          <span class="page-counter">
            {{ previewConfig.singleLineMode === 'static' ? 'Static' : previewConfig.singleLineMode === 'left' ? 'Move left' : 'Move right' }}
          </span>
        </div>

        <div class="toolbar-group info-group">
          <span>Speed {{ previewConfig.singleLineSpeed }}px/frame</span>
          <span>{{ previewConfig.singleLineSeamless ? 'Seamless loop on' : 'Seamless loop off' }}</span>
        </div>
      </div>

      <div class="preview-viewport preview-singleline-viewport" :style="previewPageStyle">
        <div class="single-line-track" :style="singleTrackStyle">
          <div v-for="copy in singleCopies" :key="copy" class="single-line-copy" v-html="safeSingleLineHtml" />
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
  margin: 0 auto;
}

.preview-page {
  box-sizing: border-box;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 24px;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  line-height: 1.5;
}

.preview-flow {
  column-fill: auto;
  overflow: visible;
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
