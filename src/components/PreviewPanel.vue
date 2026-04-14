<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

// 预览面板负责三件事：
// 1. 按编辑区当前内容生成多行/单行的实时预览；
// 2. 在多行模式下控制顺序分页和翻页动画；
// 3. 在需要时把当前预览切成 PNG，并以下方图片列表的形式展示出来。
const props = defineProps({
  // 多行模式使用的完整富文本 HTML。
  contentHtml: {
    type: String,
    default: '',
  },
  // 单行模式使用的富文本 HTML。这里和多行分开传入，便于上层按不同规则整理内容。
  singleLineHtml: {
    type: String,
    default: '',
  },
  // 编辑区尺寸与内边距配置，预览和切图都以这组盒模型数据为准。
  boxMetrics: {
    type: Object,
    required: true,
  },
  // 预览模式、翻页、切图、单行动画等全部交互配置。
  previewConfig: {
    type: Object,
    required: true,
  },
  // 水平对齐方式，和编辑区保持一致。
  textAlign: {
    type: String,
    default: 'left',
  },
  // 垂直对齐方式，用于单行模式和多行最后一页的垂直分布。
  verticalAlign: {
    type: String,
    default: 'center',
  },
})

// 隐藏测量层：多行用来计算分页高度，单行用来测量整条文字的实际宽度。
const multilineMeasureRef = ref(null)
const singleMeasureRef = ref(null)

// 当前页与多行分页状态。
const currentPage = ref(0)
const hasTruncatedPages = ref(false)
const multilinePageCount = ref(1)

// 切图结果与切图过程状态。
const cutImagePreviews = ref([])
const cutImageError = ref('')
const isGeneratingCutImages = ref(false)

// 单行滚动偏移量与单行原始宽度。
const singleOffset = ref(0)
const singleRawWidth = ref(0)

// 多行翻页动画状态。
// from/to 表示当前动画涉及的起始页和目标页；
// phase 用于区分“准备阶段”和“真正执行 transition 的阶段”。
const transitionState = ref({
  active: false,
  phase: 'idle',
  from: 0,
  to: 0,
  direction: 'static',
})

// 定时器与测量上下文。
// pageTimerId 控制多行自动翻页停留时间；
// transitionTimerId 控制翻页动画结束时机；
// animationFrameId 控制单行滚动动画；
// textMeasureContext 用于复用 canvas 文本测量能力，减少重复创建开销。
let pageTimerId = 0
let transitionTimerId = 0
let animationFrameId = 0
let textMeasureContext = null

// 纯 canvas 渲染时的默认文本样式基线。
// 当某些 HTML 片段没有显式样式时，会从这里补齐缺省值。
const BASE_RENDER_STYLE = {
  fontSize: 24,
  fontFamily: "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
  fontWeight: 'normal',
  fontStyle: 'normal',
  color: '#000000',
  background: 'transparent',
  letterSpacing: 0,
  lineHeightValue: 1.5,
  textDecoration: 'none',
  strokeWidth: 0,
  strokeColor: 'transparent',
  textShadows: [],
}

// 样式解析缓存：
// parsedTokenStyleCache 针对 style 字符串做解析缓存；
// computedCanvasStyleCache 针对真实 DOM 元素的 computed style 做缓存。
const parsedTokenStyleCache = new Map()
const computedCanvasStyleCache = new WeakMap()

// 垂直对齐需要归一化到 flex 的对齐值，避免上层传入异常值导致布局偏移。
const normalizedVerticalAlign = computed(() => normalizeVerticalAlign(props.verticalAlign))

// 预览页统一尺寸。多行页层和单行视口都依赖这组基础尺寸。
const previewPageStyle = computed(() => ({
  width: `${props.boxMetrics.width}px`,
  height: `${props.boxMetrics.height}px`,
}))

// 单行预览视口样式：完整保留四向 padding，并在容器层处理垂直对齐。
const singleLineViewportStyle = computed(() => ({
  ...previewPageStyle.value,
  paddingTop: `${props.boxMetrics.paddingTop}px`,
  paddingRight: `${props.boxMetrics.paddingRight}px`,
  paddingBottom: `${props.boxMetrics.paddingBottom}px`,
  paddingLeft: `${props.boxMetrics.paddingLeft}px`,
  textAlign: props.textAlign,
  alignItems: normalizedVerticalAlign.value,
}))

// 多行连续流样式：用于真实分页视图和隐藏测量层，确保两者版式来源完全一致。
const multilineFlowStyle = computed(() => ({
  width: `${props.boxMetrics.width}px`,
  minHeight: `${props.boxMetrics.height}px`,
  paddingTop: `${props.boxMetrics.paddingTop}px`,
  paddingRight: `${props.boxMetrics.paddingRight}px`,
  paddingBottom: `${props.boxMetrics.paddingBottom}px`,
  paddingLeft: `${props.boxMetrics.paddingLeft}px`,
  textAlign: props.textAlign,
}))

// 空内容时用不换行空格兜底，避免测量层高度和切图结果变成 0。
const safeContentHtml = computed(() => props.contentHtml || '&nbsp;')
const safeSingleLineHtml = computed(() => props.singleLineHtml || '&nbsp;')

// 多行页码与切图宽度派生值。
const visiblePageCount = computed(() => multilinePageCount.value)
const multilinePageText = computed(() => `${Math.min(currentPage.value + 1, visiblePageCount.value)} / ${visiblePageCount.value}`)
const effectiveCutImageWidth = computed(() =>
  clampCutImageWidth(props.previewConfig.cutImageWidth || props.boxMetrics.width),
)

// 当前真正需要渲染到预览视口中的页层集合。
// 静止时只渲染当前页；动画时同时渲染“上一页”和“目标页”，保证 transition 连续执行。
const activeMultilinePages = computed(() => {
  if (!transitionState.value.active) {
    return [
      {
        key: `page-${currentPage.value}`,
        pageIndex: currentPage.value,
        layerStyle: getTransitionLayerStyle('idle'),
        flowStyle: getMultilineSliceStyle(currentPage.value),
      },
    ]
  }

  return [
    {
      key: `from-${transitionState.value.from}-${transitionState.value.to}`,
      pageIndex: transitionState.value.from,
      layerStyle: getTransitionLayerStyle('from'),
      flowStyle: getMultilineSliceStyle(transitionState.value.from),
    },
    {
      key: `to-${transitionState.value.from}-${transitionState.value.to}`,
      pageIndex: transitionState.value.to,
      layerStyle: getTransitionLayerStyle('to'),
      flowStyle: getMultilineSliceStyle(transitionState.value.to),
    },
  ]
})

// 单行模式下的宽度、切片数和无缝滚动副本数量。
const singleEffectiveWidth = computed(() => Math.min(singleRawWidth.value, 65536))
const singleSliceCount = computed(() => Math.max(1, Math.ceil(singleEffectiveWidth.value / 8096)))
const singleIsTruncated = computed(() => singleRawWidth.value > 65536)
const singleCopies = computed(() => (props.previewConfig.singleLineSeamless ? [0, 1, 2] : [0]))

// 单行滚动轨道位移样式。
// 无缝模式通过三份副本拼接形成循环，不无缝时直接平移单份内容。
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

// 只要预览源内容、盒模型、模式或动画参数发生变化，就重新测量并重启预览状态。
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
    props.previewConfig.cutImageWidth,
    props.previewConfig.singleLineMode,
    props.previewConfig.singleLineSpeed,
    props.previewConfig.singleLineSeamless,
    props.verticalAlign,
  ],
  async () => {
    currentPage.value = 0
    singleOffset.value = 0
    resetTransitionState()
    resetCutImages()

    await nextTick()
    paginateMultilineContent()
    measureSingleLineBounds()
    restartMultilineAutoplay()
    restartSingleLineAnimation()
  },
  { immediate: true },
)

// 组件销毁时统一停止计时器和动画帧，避免页面离开后仍然有后台任务在运行。
onBeforeUnmount(() => {
  stopMultilineAutoplay()
  stopPageTransition()
  stopSingleLineAnimation()
})

// 暴露切图方法，供上层点击工具栏按钮时直接调用。
defineExpose({
  generateCutImages,
})

function paginateMultilineContent() {
  // 通过隐藏测量层的 scrollHeight 计算总页数。
  // 这里不会修改真实内容，只负责得出“当前内容在当前尺寸下应该分成几页”。
  if (!multilineMeasureRef.value) {
    multilinePageCount.value = 1
    hasTruncatedPages.value = false
    return
  }

  const totalHeight = Math.max(props.boxMetrics.height, Math.ceil(multilineMeasureRef.value.scrollHeight))
  const rawPageCount = Math.max(1, Math.ceil(totalHeight / Math.max(1, props.boxMetrics.height)))

  multilinePageCount.value = Math.min(10, rawPageCount)
  hasTruncatedPages.value = rawPageCount > 10

  if (currentPage.value >= multilinePageCount.value) {
    currentPage.value = 0
  }
}

// 把富文本 HTML 拆成“逐字符 token”序列，方便后续做精确的 canvas 排版和切图。
function tokenizeHtml(html) {
  const container = document.createElement('div')
  container.innerHTML = html

  const tokens = []
  walkNodes(container, '', tokens)
  return tokens
}

// 深度遍历节点树，继承并合并父级内联样式，把文本拆成单字符 token。
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

// 合并父子两层 style 文本，后出现的属性覆盖先出现的属性。
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

// 把内联 style 字符串解析为 [属性名, 属性值] 数组，便于后续合并和缓存。
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

// 把 token 列表重新拼回 HTML。这个能力主要用于中间态调试和后续排版扩展。
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

// 把当前缓冲区中的纯文本包装成带样式的 span，减少重复拼接逻辑。
function flushBufferedHtml(buffer, styleText) {
  if (!buffer) {
    return ''
  }

  if (!styleText) {
    return buffer
  }

  return `<span style="${escapeAttribute(styleText)}">${buffer}</span>`
}

// HTML 转义，避免普通文本字符在模板字符串里被当成标签解析。
function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

// 属性值转义，避免双引号等字符破坏 style 属性结构。
function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
}

// 判断测量层是否产生溢出。后续如需更精细分页策略，可以复用这个判断。
function isMeasureOverflowing(element) {
  return element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth
}

// 多行自动翻页控制：只在多页且当前模式为 multiline 时启动。
function restartMultilineAutoplay() {
  stopMultilineAutoplay()

  if (props.previewConfig.format !== 'multiline' || multilinePageCount.value <= 1) {
    return
  }

  scheduleNextMultilineTurn()
}

// 清除多行停留计时器，避免在切页中叠加多个待执行任务。
function stopMultilineAutoplay() {
  if (!pageTimerId) {
    return
  }

  window.clearTimeout(pageTimerId)
  pageTimerId = 0
}

// 上一页按钮。动画执行期间不允许再次触发切页，避免页序错乱。
function goToPreviousPage() {
  if (multilinePageCount.value <= 1 || transitionState.value.active) {
    return
  }

  goToPage((currentPage.value - 1 + multilinePageCount.value) % multilinePageCount.value)
}

// 下一页按钮，逻辑和上一页一致。
function goToNextPage() {
  if (multilinePageCount.value <= 1 || transitionState.value.active) {
    return
  }

  goToPage((currentPage.value + 1) % multilinePageCount.value)
}

// 多行分页切换的唯一入口。
// 如果 motion 为 static，则直接切页；
// 否则先建立 from/to 双层页，再通过 phase 切换触发 CSS transition。
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

  // 连续两帧的 requestAnimationFrame 用来确保浏览器先提交“初始位置”，
  // 再切到 running 状态，这样 CSS transition 才能被可靠触发。
  nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        transitionState.value = {
          ...transitionState.value,
          phase: 'running',
        }
      })
    })
  })

  transitionTimerId = window.setTimeout(() => {
    currentPage.value = targetPage
    resetTransitionState()
    restartMultilineAutoplay()
  }, clampTransitionMs(props.previewConfig.pageTransitionMs))
}

// 按配置的停留时长，顺序推进到下一页。
function scheduleNextMultilineTurn() {
  pageTimerId = window.setTimeout(() => {
    pageTimerId = 0
    goToPage((currentPage.value + 1) % multilinePageCount.value)
  }, clampPageStaySeconds(props.previewConfig.pageStaySeconds) * 1000)
}

// 停止当前翻页动画的结束计时器。
function stopPageTransition() {
  if (transitionTimerId) {
    window.clearTimeout(transitionTimerId)
    transitionTimerId = 0
  }
}

// 重置翻页动画状态，让页面回到静止单页展示。
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

// 根据页层角色返回不同样式：
// idle 表示静止状态；
// from 表示正在移出的上一页；
// to 表示承接的目标页。
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

// 把方向枚举转换成 translate3d 所需的位移向量。
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

// 多行页本质上是同一份连续内容的不同纵向切片。
// 通过 translateY 按页高偏移，保证预览与测量来源完全一致。
function getMultilineSliceStyle(pageIndex) {
  return {
    ...multilineFlowStyle.value,
    transform: `translateY(-${pageIndex * props.boxMetrics.height}px)`,
  }
}

// 对外暴露的切图入口。切图过程中会锁住按钮，避免重复触发并发任务。
async function generateCutImages() {
  if (isGeneratingCutImages.value) {
    return
  }

  isGeneratingCutImages.value = true
  cutImageError.value = ''

  try {
    await nextTick()

    cutImagePreviews.value =
      props.previewConfig.format === 'multiline'
        ? await buildMultilineCutImages()
        : await buildSingleLineCutImages()
  } catch (error) {
    cutImagePreviews.value = []
    cutImageError.value =
      error instanceof Error ? error.message : 'PNG generation failed in the current browser.'
  } finally {
    isGeneratingCutImages.value = false
  }
}

async function buildMultilineCutImages() {
  // 多行模式直接基于隐藏测量层采集字形位置信息，然后按页高逐页裁出 PNG。
  if (!multilineMeasureRef.value) {
    return []
  }

  const glyphs = collectMultilineGlyphs(multilineMeasureRef.value)
  const images = []

  for (let index = 0; index < multilinePageCount.value; index += 1) {
    const width = props.boxMetrics.width
    const height = props.boxMetrics.height

    images.push({
      id: `page-${index + 1}`,
      label: `Page ${index + 1}`,
      width,
      height,
      url: renderCanvasToPng(renderMultilineSliceToCanvas(width, height, index, glyphs)),
    })
  }

  return images
}

async function buildSingleLineCutImages() {
  // 单行模式先算出整条文本的布局宽度，再按 cut image width 逐段切图。
  const images = []
  const layout = buildTextLayout(safeSingleLineHtml.value, {
    maxWidth: Number.POSITIVE_INFINITY,
    singleLine: true,
  })
  const totalWidth = Math.max(1, Math.min(65536, Math.ceil(layout.width)))
  const cutWidth = effectiveCutImageWidth.value
  const height = Math.max(1, Math.ceil(layout.contentHeight))
  const totalSlices = Math.max(1, Math.ceil(totalWidth / cutWidth))

  for (let index = 0; index < totalSlices; index += 1) {
    const offset = index * cutWidth
    const width = Math.min(cutWidth, Math.max(1, totalWidth - offset))

    images.push({
      id: `slice-${index + 1}`,
      label: `Slice ${index + 1}`,
      width,
      height,
      url: renderCanvasToPng(
        renderSingleLineSliceToCanvas({
          width,
          height,
          sliceStart: offset,
          totalWidth,
          layout,
        }),
      ),
    })
  }

  return images
}

// 通用版 canvas 排版入口。当前主要为后续扩展保留，核心思想是：
// 先算出内容区域尺寸，再根据水平/垂直对齐把每一行依次画上去。
function renderLayoutToCanvas({
  width,
  height,
  layout,
  paddingTop,
  paddingRight,
  paddingBottom,
  paddingLeft,
  textAlign,
  verticalAlign,
}) {
  const canvas = createCanvas(width, height)
  const context = getCanvasContext(canvas)
  const contentWidth = Math.max(1, width - paddingLeft - paddingRight)
  const contentHeight = Math.max(0, height - paddingTop - paddingBottom)
  const offsetY = getVerticalOffset(verticalAlign, contentHeight, layout.contentHeight)
  let lineTop = paddingTop + offsetY

  layout.lines.forEach((line) => {
    const startX = paddingLeft + getHorizontalOffset(textAlign, contentWidth, line.width)
    drawLine(context, line, startX, lineTop)
    lineTop += line.lineHeight
  })

  return canvas
}

// 渲染单行切片。通过负向位移把目标片段移动到画布可见区域，再配合 clip 裁掉两侧内容。
function renderSingleLineSliceToCanvas({ width, height, sliceStart, totalWidth, layout }) {
  const canvas = createCanvas(width, height)
  const context = getCanvasContext(canvas)
  const line = layout.lines[0] ?? createEmptyLine(getBaseRenderStyle())

  drawLine(context, line, -sliceStart, 0, {
    clipLeft: 0,
    clipRight: Math.min(totalWidth - sliceStart, width),
  })

  return canvas
}

// 渲染多行某一页。这里只画落在当前页可视区间内的字形。
function renderMultilineSliceToCanvas(width, height, pageIndex, glyphs) {
  const canvas = createCanvas(width, height)
  const context = getCanvasContext(canvas)
  const pageTop = pageIndex * height
  const pageBottom = pageTop + height

  glyphs.forEach((glyph) => {
    if (glyph.bottom <= pageTop || glyph.top >= pageBottom) {
      return
    }

    drawResolvedGlyph(context, glyph, pageTop)
  })

  return canvas
}

// 创建指定尺寸的离屏 canvas。
function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

// 获取 2D 上下文并初始化统一的底色和文本绘制参数。
function getCanvasContext(canvas) {
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D context is unavailable.')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.textBaseline = 'alphabetic'
  context.lineJoin = 'round'
  context.lineCap = 'round'

  return context
}

// 把 canvas 导出为 PNG data URL，供图片预览直接使用。
function renderCanvasToPng(canvas) {
  return canvas.toDataURL('image/png')
}

// 从真实 DOM 中逐字符采集字形矩形和样式。
// 这条路径用于多行切图，因为它最接近浏览器已经完成的最终排版结果。
function collectMultilineGlyphs(root) {
  const rootRect = root.getBoundingClientRect()
  const glyphs = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)

  while (walker.nextNode()) {
    const textNode = walker.currentNode
    const parentElement = textNode.parentElement ?? root
    const computedStyle = getComputedCanvasStyle(parentElement)
    const text = textNode.textContent ?? ''

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index]
      if (character === '\n' || character === '\r') {
        continue
      }

      const range = document.createRange()
      range.setStart(textNode, index)
      range.setEnd(textNode, index + 1)

      const rectList = [...range.getClientRects()]
      if (!rectList.length) {
        const fallbackWidth = measureCharacter(character, computedStyle).width
        const previousGlyph = glyphs[glyphs.length - 1]
        const fallbackX = previousGlyph ? previousGlyph.x + previousGlyph.advance : 0
        glyphs.push({
          char: character,
          style: computedStyle,
          x: fallbackX,
          width: fallbackWidth,
          advance: fallbackWidth + computedStyle.letterSpacing,
          top: previousGlyph ? previousGlyph.top : 0,
          bottom: previousGlyph ? previousGlyph.bottom : computedStyle.lineHeightPx,
          height: previousGlyph ? previousGlyph.height : computedStyle.lineHeightPx,
        })
        range.detach?.()
        continue
      }

      rectList.forEach((rect) => {
        const width = rect.width || measureCharacter(character, computedStyle).width

        glyphs.push({
          char: character,
          style: computedStyle,
          x: rect.left - rootRect.left,
          width,
          advance: width + computedStyle.letterSpacing,
          top: rect.top - rootRect.top,
          bottom: rect.bottom - rootRect.top,
          height: rect.height || computedStyle.lineHeightPx,
        })
      })

      range.detach?.()
    }
  }

  return glyphs
}

// 使用纯 canvas 规则重建文本布局。
// 单行切图依赖这里计算整段内容的宽度和每个字符的落点。
function buildTextLayout(html, { maxWidth, singleLine }) {
  const tokens = tokenizeHtml(html)
  const baseStyle = getBaseRenderStyle()
  const lines = []
  let currentLine = createEmptyLine(baseStyle)

  tokens.forEach((token) => {
    if (token.type === 'br') {
      if (singleLine) {
        return
      }

      lines.push(finalizeLine(currentLine))
      currentLine = createEmptyLine(baseStyle)
      return
    }

    const style = getParsedTokenStyle(token.style)
    const metrics = measureCharacter(token.value, style)

    if (!singleLine && currentLine.commands.length > 0 && currentLine.advance + metrics.width > maxWidth) {
      lines.push(finalizeLine(currentLine))
      currentLine = createEmptyLine(baseStyle)
    }

    currentLine.commands.push({
      char: token.value,
      style,
      x: currentLine.advance,
      width: metrics.width,
      advance: metrics.advance,
    })
    currentLine.advance += metrics.advance
    currentLine.width = currentLine.advance - style.letterSpacing
    currentLine.lineHeight = Math.max(currentLine.lineHeight, style.lineHeightPx)
    currentLine.maxAscent = Math.max(currentLine.maxAscent, style.ascent)
    currentLine.maxDescent = Math.max(currentLine.maxDescent, style.descent)
    currentLine.textHeight = Math.max(currentLine.textHeight, style.ascent + style.descent)
  })

  if (currentLine.commands.length || !lines.length) {
    lines.push(finalizeLine(currentLine))
  }

  return {
    lines,
    width: Math.max(...lines.map((line) => line.width), 0),
    contentHeight: lines.reduce((total, line) => total + line.lineHeight, 0),
  }
}

// 创建一条空白逻辑行，并用基础样式初始化行高、基线相关数据。
function createEmptyLine(baseStyle) {
  return {
    commands: [],
    advance: 0,
    width: 0,
    lineHeight: baseStyle.lineHeightPx,
    maxAscent: baseStyle.ascent,
    maxDescent: baseStyle.descent,
    textHeight: baseStyle.ascent + baseStyle.descent,
  }
}

// 行结束时做一次最小整理，避免宽度出现负值。
function finalizeLine(line) {
  return {
    ...line,
    width: Math.max(0, line.width),
  }
}

// 把单行或多行中的一整行命令绘制到 canvas 上。
// clip 参数主要给单行切片使用，只允许可见片段进入最终导出图像。
function drawLine(context, line, startX, lineTop, clip = null) {
  const baseline =
    lineTop + Math.max(0, (line.lineHeight - line.textHeight) / 2) + line.maxAscent

  if (clip) {
    context.save()
    context.beginPath()
    context.rect(clip.clipLeft, 0, Math.max(0, clip.clipRight - clip.clipLeft), context.canvas.height)
    context.clip()
  }

  line.commands.forEach((command) => {
    drawCharacter(context, command, startX + command.x, baseline, lineTop, line.lineHeight)
  })

  if (clip) {
    context.restore()
  }
}

// 多行切图使用的字形绘制入口。
// 它会把“整篇文档中的绝对位置”转换成“当前页中的相对位置”。
function drawResolvedGlyph(context, glyph, pageTop) {
  const y = glyph.top - pageTop
  const baseline =
    y + Math.max(0, (glyph.height - (glyph.style.ascent + glyph.style.descent)) / 2) + glyph.style.ascent

  drawCharacter(context, {
    char: glyph.char,
    style: glyph.style,
    width: glyph.width,
    advance: glyph.advance,
  }, glyph.x, baseline, y, glyph.height)
}

// 实际的单字符绘制函数。
// 背景色、阴影、描边、填充和下划线都在这里按顺序执行，确保和编辑区显示接近一致。
function drawCharacter(context, command, x, baseline, lineTop, lineHeight) {
  const { style, char, width, advance } = command

  context.font = style.font
  context.textBaseline = 'alphabetic'

  if (style.background) {
    context.fillStyle = style.background
    context.fillRect(x, lineTop, Math.max(width, advance), lineHeight)
  }

  if (style.textShadows.length) {
    style.textShadows.forEach((shadow) => {
      context.fillStyle = shadow.color
      context.fillText(char, x + shadow.x, baseline + shadow.y)
    })
  }

  if (style.strokeWidth > 0) {
    context.lineWidth = style.strokeWidth
    context.strokeStyle = style.strokeColor
    context.strokeText(char, x, baseline)
  }

  context.fillStyle = style.color
  context.fillText(char, x, baseline)

  if (style.underline) {
    const underlineY = baseline + Math.max(1, style.fontSize * 0.08)
    context.strokeStyle = style.color
    context.lineWidth = Math.max(1, style.fontSize * 0.06)
    context.beginPath()
    context.moveTo(x, underlineY)
    context.lineTo(x + Math.max(width, advance - style.letterSpacing), underlineY)
    context.stroke()
  }
}

// 返回 canvas 渲染使用的基础样式对象。
function getBaseRenderStyle() {
  return finalizeParsedTokenStyle({
    ...BASE_RENDER_STYLE,
  })
}

// 从真实 DOM 元素读取浏览器计算后的样式，并缓存成 canvas 可直接使用的结构。
function getComputedCanvasStyle(element) {
  const cached = computedCanvasStyleCache.get(element)
  if (cached) {
    return cached
  }

  const computed = window.getComputedStyle(element)
  const style = finalizeParsedTokenStyle({
    fontSize: parsePx(computed.fontSize, BASE_RENDER_STYLE.fontSize),
    fontFamily: computed.fontFamily || BASE_RENDER_STYLE.fontFamily,
    fontWeight: computed.fontWeight || BASE_RENDER_STYLE.fontWeight,
    fontStyle: computed.fontStyle || BASE_RENDER_STYLE.fontStyle,
    color: computed.color || BASE_RENDER_STYLE.color,
    background: normalizeBackgroundColor(computed.backgroundColor),
    letterSpacing: parsePx(computed.letterSpacing, BASE_RENDER_STYLE.letterSpacing),
    lineHeightValue: parseLineHeightValue(computed.lineHeight, BASE_RENDER_STYLE.lineHeightValue),
    textDecoration: computed.textDecorationLine || computed.textDecoration || BASE_RENDER_STYLE.textDecoration,
    strokeWidth: parsePx(computed.getPropertyValue('-webkit-text-stroke-width'), 0),
    strokeColor: computed.getPropertyValue('-webkit-text-stroke-color') || 'transparent',
    textShadows: parseTextShadows(computed.textShadow),
  })

  computedCanvasStyleCache.set(element, style)
  return style
}

// 从 token 自带的 style 文本中解析样式。
// 这条路径和 getComputedCanvasStyle 对应，前者解析 HTML 内联样式，后者读取真实渲染样式。
function getParsedTokenStyle(styleText) {
  const cacheKey = styleText || '__default__'
  const cached = parsedTokenStyleCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const styleEntries = new Map(serializeStyleEntries(styleText))
  const stroke = parseStrokeStyle(styleEntries)
  const parsed = finalizeParsedTokenStyle({
    fontSize: parsePx(styleEntries.get('font-size'), BASE_RENDER_STYLE.fontSize),
    fontFamily: styleEntries.get('font-family') || BASE_RENDER_STYLE.fontFamily,
    fontWeight: styleEntries.get('font-weight') || BASE_RENDER_STYLE.fontWeight,
    fontStyle: styleEntries.get('font-style') || BASE_RENDER_STYLE.fontStyle,
    color: styleEntries.get('color') || BASE_RENDER_STYLE.color,
    background: normalizeBackgroundColor(
      styleEntries.get('background-color') || styleEntries.get('background') || BASE_RENDER_STYLE.background,
    ),
    letterSpacing: parsePx(styleEntries.get('letter-spacing'), BASE_RENDER_STYLE.letterSpacing),
    lineHeightValue: parseLineHeightValue(styleEntries.get('line-height'), BASE_RENDER_STYLE.lineHeightValue),
    textDecoration:
      styleEntries.get('text-decoration-line') || styleEntries.get('text-decoration') || BASE_RENDER_STYLE.textDecoration,
    strokeWidth: stroke.width,
    strokeColor: stroke.color,
    textShadows: parseTextShadows(styleEntries.get('text-shadow')),
  })

  parsedTokenStyleCache.set(cacheKey, parsed)
  return parsed
}

// 统一补齐 font、行高、上下行包围盒和下划线标记，得到完整可绘制的样式对象。
function finalizeParsedTokenStyle(style) {
  const font = buildCanvasFont(style)
  const lineHeightPx = resolveLineHeightPx(style.lineHeightValue, style.fontSize)
  const metrics = measureFontMetrics(font, style.fontSize)

  return {
    ...style,
    font,
    lineHeightPx: Math.max(lineHeightPx, metrics.ascent + metrics.descent),
    ascent: metrics.ascent,
    descent: metrics.descent,
    underline: String(style.textDecoration).includes('underline'),
  }
}

// 拼出 canvas 需要的标准 font 字符串。
function buildCanvasFont(style) {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`.trim()
}

// 通过测量 `Mg` 得到近似的 ascent / descent，用于基线和行高计算。
function measureFontMetrics(font, fontSize) {
  const context = getTextMeasureContext()
  context.font = font
  const metrics = context.measureText('Mg')

  return {
    ascent: metrics.actualBoundingBoxAscent || fontSize * 0.8,
    descent: metrics.actualBoundingBoxDescent || fontSize * 0.2,
  }
}

// 测量单个字符的宽度和包含 letter-spacing 的推进宽度。
function measureCharacter(value, style) {
  const context = getTextMeasureContext()
  context.font = style.font
  const width = context.measureText(value).width

  return {
    width,
    advance: width + style.letterSpacing,
  }
}

// 延迟创建并复用文本测量 canvas 上下文。
function getTextMeasureContext() {
  if (textMeasureContext) {
    return textMeasureContext
  }

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D context is unavailable.')
  }

  textMeasureContext = context
  return textMeasureContext
}

// 根据 left / center / right 计算一行在内容区中的起始偏移量。
function getHorizontalOffset(textAlign, contentWidth, lineWidth) {
  if (textAlign === 'center') {
    return Math.max(0, (contentWidth - lineWidth) / 2)
  }

  if (textAlign === 'right') {
    return Math.max(0, contentWidth - lineWidth)
  }

  return 0
}

// 根据垂直对齐方式计算整块内容在视口内的纵向偏移。
function getVerticalOffset(verticalAlign, availableHeight, contentHeight) {
  if (verticalAlign === 'center') {
    return Math.max(0, (availableHeight - contentHeight) / 2)
  }

  if (verticalAlign === 'flex-end') {
    return Math.max(0, availableHeight - contentHeight)
  }

  return 0
}

// 解析文字描边，兼容 `-webkit-text-stroke` 简写和 width/color 分写两种形式。
function parseStrokeStyle(styleEntries) {
  const shorthand = String(styleEntries.get('-webkit-text-stroke') || '').trim()
  const width =
    parsePx(styleEntries.get('-webkit-text-stroke-width'), 0) ||
    parsePx(shorthand.split(/\s+/)[0], 0)
  const color =
    styleEntries.get('-webkit-text-stroke-color') ||
    shorthand.replace(/^[\d.\-]+px\s*/, '').trim() ||
    'transparent'

  return {
    width,
    color,
  }
}

// 把 text-shadow 解析成 canvas 可直接绘制的阴影数组。
function parseTextShadows(value) {
  if (!value || value === 'none') {
    return []
  }

  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(/\s+/)
      if (parts.length < 4) {
        return null
      }

      return {
        x: Number.parseFloat(parts[0]) || 0,
        y: Number.parseFloat(parts[1]) || 0,
        color: parts.slice(3).join(' ') || '#000000',
      }
    })
    .filter(Boolean)
}

// line-height 既可能是倍数也可能是像素值，这里统一解析成数值。
function parseLineHeightValue(value, fallback) {
  if (!value || value === 'normal') {
    return fallback
  }

  if (String(value).trim().endsWith('px')) {
    return Number.parseFloat(value)
  }

  const number = Number.parseFloat(value)
  return Number.isFinite(number) ? number : fallback
}

// 把 line-height 的倍数值转换成实际像素值。
function resolveLineHeightPx(value, fontSize) {
  if (!Number.isFinite(value)) {
    return fontSize * BASE_RENDER_STYLE.lineHeightValue
  }

  return value > 8 ? value : value * fontSize
}

// 提取 px 数值，失败时回退到给定默认值。
function parsePx(value, fallback) {
  const number = Number.parseFloat(value)
  return Number.isFinite(number) ? number : fallback
}

// 透明背景在 canvas 上不需要额外绘制，这里统一转换为 null。
function normalizeBackgroundColor(value) {
  if (!value) {
    return null
  }

  const normalized = String(value).trim().toLowerCase()
  if (normalized === 'transparent' || normalized === 'rgba(0, 0, 0, 0)') {
    return null
  }

  return value
}

// 当内容或配置变更时，清空旧的 PNG 结果，防止用户看到过期切图。
function resetCutImages() {
  cutImagePreviews.value = []
  cutImageError.value = ''
}

// 测量单行文本的完整滚动宽度，供动画和切片数量计算使用。
function measureSingleLineBounds() {
  if (!singleMeasureRef.value) {
    singleRawWidth.value = 0
    return
  }

  singleRawWidth.value = Math.ceil(singleMeasureRef.value.scrollWidth)
}

// 启动单行滚动动画。
// seamless 模式始终在固定宽度内循环；
// 非 seamless 模式则在离开视口后重新从另一侧进入。
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

// 停止单行 requestAnimationFrame 动画。
function stopSingleLineAnimation() {
  if (!animationFrameId) {
    return
  }

  window.cancelAnimationFrame(animationFrameId)
  animationFrameId = 0
}

// 各类配置值都在这里统一钳制，避免上层传入非法值后破坏预览逻辑。
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

function clampCutImageWidth(value) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number)) {
    return Math.max(1, props.boxMetrics.width)
  }

  return Math.min(65536, Math.max(1, number))
}

function clampSingleLineSpeed(value) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number)) {
    return 3
  }

  return Math.min(9, Math.max(1, number))
}

// 垂直对齐只允许三种安全值，其它输入一律回退到 center。
function normalizeVerticalAlign(value) {
  if (value === 'flex-start' || value === 'center' || value === 'flex-end') {
    return value
  }

  return 'center'
}
</script>

<template>
  <section class="preview-stage">
    <!-- 预览头部：展示当前输出模式以及页数/切片数摘要。 -->
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
      <!-- 多行模式工具条：控制顺序翻页，并展示 motion、transition、stay 参数。 -->
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

      <!-- 多行可视页栈：静止时只有一层，动画执行时会同时渲染 from/to 两层。 -->
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
          <div class="preview-page-flow" :style="page.flowStyle">
            <div class="preview-page-copy" v-html="safeContentHtml" />
          </div>
        </div>
      </div>

      <!-- 隐藏测量层：专门用于计算 scrollHeight 和分页，不参与实际展示。 -->
      <div
        ref="multilineMeasureRef"
        class="preview-page preview-flow-measure"
        :style="multilineFlowStyle"
        aria-hidden="true"
        v-html="safeContentHtml"
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
      <!-- 单行模式工具条：展示当前滚动模式、速度和是否无缝衔接。 -->
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

      <!-- 单行可视区：轨道负责移动文本，隐藏测量层负责给出完整宽度。 -->
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

  <!-- PNG 切图结果区：只有在生成中、已有结果或出现错误时才渲染。 -->
  <section v-if="isGeneratingCutImages || cutImagePreviews.length || cutImageError" class="cut-preview-stage">
    <div class="preview-header">
      <div>
        <p class="preview-eyebrow">PNG output</p>
        <h2>Cut preview</h2>
      </div>

      <div class="preview-meta">
        <span class="meta-chip">{{ previewConfig.format === 'multiline' ? 'Paged PNG' : 'Sliced PNG' }}</span>
        <span v-if="cutImagePreviews.length" class="meta-chip">
          {{ cutImagePreviews.length }} image{{ cutImagePreviews.length > 1 ? 's' : '' }}
        </span>
      </div>
    </div>

    <p v-if="isGeneratingCutImages" class="preview-note">Generating PNG images...</p>
    <p v-else-if="cutImageError" class="preview-warning">{{ cutImageError }}</p>

    <div v-else class="cut-preview-list">
      <article v-for="image in cutImagePreviews" :key="image.id" class="cut-preview-item">
        <div class="cut-preview-meta">
          <span class="meta-chip">{{ image.label }}</span>
          <span class="meta-chip">{{ image.width }} x {{ image.height }}</span>
        </div>
        <img class="cut-preview-image" :src="image.url" :alt="image.label" />
      </article>
    </div>
  </section>
</template>

<style scoped>
/* 预览区与切图区采用统一卡片视觉，方便用户直接对照内容和导出结果。 */
.preview-stage {
  margin-top: 18px;
  padding: 20px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(18px);
  box-shadow: 0 24px 80px rgba(34, 49, 74, 0.12);
}

.cut-preview-stage {
  margin-top: 18px;
  padding: 20px;
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(18px);
  box-shadow: 0 24px 80px rgba(34, 49, 74, 0.12);
}

/* 头部和工具条统一使用弹性布局，窄屏时允许自动换行。 */
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

/* 模式标签、页码和状态文本都使用胶囊标签样式进行统一表达。 */
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

/* 所有预览视口都负责裁切超出内容，避免动画层和单行轨道溢出。 */
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

/* 多行模式通过绝对定位叠放页层，再用 transform 执行顺序翻页动画。 */
.preview-page-stack {
  position: relative;
}

.preview-page-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: white;
  will-change: transform;
}

/* 真实显示层与隐藏测量层必须共享完全一致的排版规则。 */
.preview-page-flow,
.preview-flow-measure {
  box-sizing: border-box;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 24px;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  line-height: 1.5;
  background: white;
}

.preview-page-copy {
  width: 100%;
}

.preview-flow-measure {
  position: absolute;
  left: -99999px;
  top: 0;
  visibility: hidden;
  pointer-events: none;
}

/* 单行模式把整条文本放进可移动轨道中，轨道不换行。 */
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

/* 单行副本与测量层保留相同文字样式，保证宽度测量和展示一致。 */
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

/* 单行模式中 `<br>` 没有意义，因此直接隐藏，避免影响宽度计算。 */
.single-line-copy :deep(br),
.single-line-measure :deep(br) {
  display: none;
}

/* 翻页按钮保持简单的圆角描边风格，不喧宾夺主。 */
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

/* 只有在超页数、超宽度或切图失败等异常情况下才显示警告色。 */
.preview-warning {
  color: #b14f18;
}

/* 切图结果一张图占一行，便于逐页核对导出效果。 */
.cut-preview-list {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}

.cut-preview-item {
  display: grid;
  gap: 10px;
}

.cut-preview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cut-preview-image {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 18px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  background: white;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

/* 窄屏下收紧卡片边距，避免预览区域过度占用横向空间。 */
@media (max-width: 720px) {
  .preview-stage {
    padding: 14px;
    border-radius: 22px;
  }

  .cut-preview-stage {
    padding: 14px;
    border-radius: 22px;
  }

  .preview-viewport {
    max-width: 100%;
  }
}
</style>
