// 样式状态中心：
// 1. 定义工具栏可编辑的默认文本样式；
// 2. 定义编辑区盒模型和预览配置的默认值；
// 3. 提供把状态转换成内联 CSS 的工具函数。
import { reactive } from 'vue'

// 字体下拉选项。aliases 用于把浏览器回读的 font-family 反解成工具栏中的预设项。
export const FONT_FAMILY_OPTIONS = [
  // 把思源黑体放在首位，作为编辑区、预览区和切图共享的默认字体栈。
  // 同时兼容 Source Han Sans / Noto Sans CJK 的常见本地命名。
  {
    label: '思源黑体',
    value: "'Source Han Sans SC', 'Source Han Sans CN', 'Noto Sans CJK SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    aliases: ['source han sans sc', 'source han sans cn', 'source han sans', 'noto sans cjk sc', 'noto sans sc', '思源黑体'],
  },
  {
    label: 'Segoe UI',
    value: "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    aliases: ['segoe ui'],
  },
  {
    label: 'PingFang SC',
    value: "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
    aliases: ['pingfang sc', 'hiragino sans gb'],
  },
  {
    label: 'Microsoft YaHei',
    value: "'Microsoft YaHei', 'PingFang SC', sans-serif",
    aliases: ['microsoft yahei'],
  },
  {
    label: 'SimSun',
    value: "'SimSun', 'Songti SC', serif",
    aliases: ['simsun', 'songti sc'],
  },
  {
    label: 'Arial',
    value: "Arial, 'Helvetica Neue', sans-serif",
    aliases: ['arial', 'helvetica neue'],
  },
  {
    label: 'Verdana',
    value: 'Verdana, Geneva, sans-serif',
    aliases: ['verdana', 'geneva'],
  },
  {
    label: 'Georgia',
    value: 'Georgia, serif',
    aliases: ['georgia'],
  },
  {
    label: 'Times New Roman',
    value: "'Times New Roman', Times, serif",
    aliases: ['times new roman', 'times'],
  },
  {
    label: 'Trebuchet MS',
    value: "'Trebuchet MS', sans-serif",
    aliases: ['trebuchet ms'],
  },
  {
    label: 'Courier New',
    value: "'Courier New', Courier, monospace",
    aliases: ['courier new', 'courier'],
  },
]

// 所有外部可写入编辑器的尺寸、样式数值都在这里设安全边界。
// 这些上限既保护 DOM 布局，也避免后续 canvas 切图创建超大位图。
export const MIN_EDITOR_DIMENSION = 120
export const MAX_EDITOR_DIMENSION = 4096
export const MAX_EDITOR_PADDING = 2048
export const MAX_CANVAS_PIXELS = 16777216
export const MAX_CANVAS_DIMENSION = 8192
export const MIN_TEXT_FONT_SIZE = 1
export const MAX_TEXT_FONT_SIZE = 512
export const MIN_LETTER_SPACING = -10
export const MAX_LETTER_SPACING = 30
export const MIN_LINE_HEIGHT = 1
export const MAX_LINE_HEIGHT = 3
export const MAX_STROKE_WIDTH = 12
export const MAX_FONT_FAMILY_LENGTH = 240
export const MAX_TEXT_SHADOW_COUNT = 144
export const MAX_TEXT_SHADOW_OFFSET = 64

const STROKE_POSITIONS = new Set(['inside', 'center', 'outside'])
const TEXT_ALIGNMENTS = new Set(['left', 'center', 'right', 'justify'])
const VERTICAL_ALIGNMENTS = new Set(['flex-start', 'center', 'flex-end'])
const PREVIEW_FORMATS = new Set(['multiline', 'singleline'])
const PAGE_TRANSITION_DIRECTIONS = new Set(['static', 'left', 'right', 'up', 'down'])
const SINGLE_LINE_MODES = new Set(['static', 'left', 'right'])
const MAX_PAGE_TRANSITION_MS = 9999
const MAX_PAGE_STAY_SECONDS = 9999
const MAX_SINGLE_LINE_SPEED = 9

// 当前选中文本的默认样式。
export const DEFAULT_STYLE_STATE = {
  fontSize: 24,
  // 默认值直接复用字体列表第一项，避免编辑、预览和切图出现各自维护默认字体的分叉。
  fontFamily: FONT_FAMILY_OPTIONS[0].value,
  color: '#000000',
  background: 'transparent',
  bold: false,
  italic: false,
  underline: false,
  letterSpacing: 0,
  lineHeight: 1.5,
  strokeColor: '#000000',
  strokeWidth: 0,
  strokePosition: 'center',
  textAlign: 'left',
  verticalAlign: 'center',
}

// 编辑区自身的宽高与四向内边距配置。
export const DEFAULT_EDITOR_BOX_STATE = {
  width: 960,
  height: 540,
  paddingTop: 20,
  paddingRight: 24,
  paddingBottom: 20,
  paddingLeft: 24,
}

// 预览与切图相关的默认参数。
export const DEFAULT_PREVIEW_STATE = {
  format: 'multiline',
  pageTransitionDirection: 'static',
  pageTransitionMs: 100,
  pageStaySeconds: 10,
  cutImageWidth: DEFAULT_EDITOR_BOX_STATE.width,
  singleLineMode: 'static',
  singleLineSpeed: 3,
  singleLineSeamless: true,
}

// 创建统一的“标注”入参对象。
// 插件对外只暴露这一份对象，内部再拆成 style / editorBox / preview 三个稳定分区。
export function createTextEditorAnnotations(source = {}) {
  const annotations = toPlainObject(source)
  const style = annotations.style ?? annotations.styleState ?? {}
  const editorBox = annotations.editorBox ?? annotations.editorBoxState ?? {}
  const preview = annotations.preview ?? annotations.previewState ?? {}

  return {
    style: normalizeTextStyle(style),
    editorBox: normalizeEditorBox(editorBox),
    preview: normalizePreviewConfig(preview),
  }
}

export function normalizeTextStyle(source = {}) {
  const style = toPlainObject(source)

  // annotations 可能来自宿主应用或持久化数据，进入 DOM 前先收敛到编辑器支持的样式集合。
  return {
    fontSize: clampNumber(style.fontSize, DEFAULT_STYLE_STATE.fontSize, MIN_TEXT_FONT_SIZE, MAX_TEXT_FONT_SIZE, {
      integer: true,
    }),
    fontFamily: normalizeFontFamilyValue(style.fontFamily, DEFAULT_STYLE_STATE.fontFamily),
    color: normalizeCssTextValue(style.color, DEFAULT_STYLE_STATE.color),
    background: normalizeCssTextValue(style.background, DEFAULT_STYLE_STATE.background),
    bold: normalizeBoolean(style.bold, DEFAULT_STYLE_STATE.bold),
    italic: normalizeBoolean(style.italic, DEFAULT_STYLE_STATE.italic),
    underline: normalizeBoolean(style.underline, DEFAULT_STYLE_STATE.underline),
    letterSpacing: clampNumber(
      style.letterSpacing,
      DEFAULT_STYLE_STATE.letterSpacing,
      MIN_LETTER_SPACING,
      MAX_LETTER_SPACING,
    ),
    lineHeight: clampNumber(style.lineHeight, DEFAULT_STYLE_STATE.lineHeight, MIN_LINE_HEIGHT, MAX_LINE_HEIGHT),
    strokeColor: normalizeCssTextValue(style.strokeColor, DEFAULT_STYLE_STATE.strokeColor),
    strokeWidth: clampNumber(style.strokeWidth, DEFAULT_STYLE_STATE.strokeWidth, 0, MAX_STROKE_WIDTH),
    strokePosition: STROKE_POSITIONS.has(style.strokePosition)
      ? style.strokePosition
      : DEFAULT_STYLE_STATE.strokePosition,
    textAlign: TEXT_ALIGNMENTS.has(style.textAlign) ? style.textAlign : DEFAULT_STYLE_STATE.textAlign,
    verticalAlign: VERTICAL_ALIGNMENTS.has(style.verticalAlign)
      ? style.verticalAlign
      : DEFAULT_STYLE_STATE.verticalAlign,
  }
}

export function normalizeEditorBox(source = {}) {
  const editorBox = toPlainObject(source)

  // 编辑区尺寸会参与预览测量和截图画布尺寸计算，因此这里统一做边界保护。
  return {
    width: clampNumber(editorBox.width, DEFAULT_EDITOR_BOX_STATE.width, MIN_EDITOR_DIMENSION, MAX_EDITOR_DIMENSION, {
      integer: true,
    }),
    height: clampNumber(editorBox.height, DEFAULT_EDITOR_BOX_STATE.height, MIN_EDITOR_DIMENSION, MAX_EDITOR_DIMENSION, {
      integer: true,
    }),
    paddingTop: clampNumber(editorBox.paddingTop, DEFAULT_EDITOR_BOX_STATE.paddingTop, 0, MAX_EDITOR_PADDING, {
      integer: true,
    }),
    paddingRight: clampNumber(editorBox.paddingRight, DEFAULT_EDITOR_BOX_STATE.paddingRight, 0, MAX_EDITOR_PADDING, {
      integer: true,
    }),
    paddingBottom: clampNumber(editorBox.paddingBottom, DEFAULT_EDITOR_BOX_STATE.paddingBottom, 0, MAX_EDITOR_PADDING, {
      integer: true,
    }),
    paddingLeft: clampNumber(editorBox.paddingLeft, DEFAULT_EDITOR_BOX_STATE.paddingLeft, 0, MAX_EDITOR_PADDING, {
      integer: true,
    }),
  }
}

export function normalizePreviewConfig(source = {}) {
  const preview = toPlainObject(source)

  // 预览参数直接影响自动翻页、切片数量和动画速度，统一归一化后再写入响应式状态。
  return {
    format: PREVIEW_FORMATS.has(preview.format) ? preview.format : DEFAULT_PREVIEW_STATE.format,
    pageTransitionDirection: PAGE_TRANSITION_DIRECTIONS.has(preview.pageTransitionDirection)
      ? preview.pageTransitionDirection
      : DEFAULT_PREVIEW_STATE.pageTransitionDirection,
    pageTransitionMs: clampNumber(preview.pageTransitionMs, DEFAULT_PREVIEW_STATE.pageTransitionMs, 0, MAX_PAGE_TRANSITION_MS, {
      integer: true,
    }),
    pageStaySeconds: clampNumber(preview.pageStaySeconds, DEFAULT_PREVIEW_STATE.pageStaySeconds, 1, MAX_PAGE_STAY_SECONDS, {
      integer: true,
    }),
    cutImageWidth: clampNumber(preview.cutImageWidth, DEFAULT_PREVIEW_STATE.cutImageWidth, 1, MAX_CANVAS_DIMENSION, {
      integer: true,
    }),
    singleLineMode: SINGLE_LINE_MODES.has(preview.singleLineMode)
      ? preview.singleLineMode
      : DEFAULT_PREVIEW_STATE.singleLineMode,
    singleLineSpeed: clampNumber(preview.singleLineSpeed, DEFAULT_PREVIEW_STATE.singleLineSpeed, 1, MAX_SINGLE_LINE_SPEED, {
      integer: true,
    }),
    singleLineSeamless: normalizeBoolean(preview.singleLineSeamless, DEFAULT_PREVIEW_STATE.singleLineSeamless),
  }
}

// 输出给外层 v-model 时始终返回一份普通对象，避免把内部响应式对象泄露出去。
export function cloneTextEditorAnnotations(source = {}) {
  return createTextEditorAnnotations(source)
}

// 父组件更新 annotations 入参时，用这个函数把外部值合并进内部响应式状态。
export function patchTextEditorAnnotations(target, source = {}) {
  const nextAnnotations = createTextEditorAnnotations(source)

  Object.assign(target.style, nextAnnotations.style)
  Object.assign(target.editorBox, nextAnnotations.editorBox)
  Object.assign(target.preview, nextAnnotations.preview)
}

const defaultAnnotations = createTextEditorAnnotations()

// 工具栏直接绑定的响应式文本样式状态。
export const styleState = reactive({
  ...defaultAnnotations.style,
})

// 编辑区尺寸与 padding 的响应式状态。
export const editorBoxState = reactive({
  ...defaultAnnotations.editorBox,
})

// 预览模式、翻页和切图参数的响应式状态。
export const previewState = reactive({
  ...defaultAnnotations.preview,
})

// 把当前工具栏状态转换成可直接写入 DOM 的样式对象。
export function styleToCss(state) {
  const normalizedState = normalizeTextStyle(state)
  const strokeStyle = getStrokeStyle(normalizedState)

  return {
    fontSize: `${normalizedState.fontSize}px`,
    fontFamily: normalizedState.fontFamily,
    color: normalizedState.color,
    background: normalizedState.background,
    fontWeight: normalizedState.bold ? 'bold' : 'normal',
    fontStyle: normalizedState.italic ? 'italic' : 'normal',
    textDecoration: normalizedState.underline ? 'underline' : 'none',
    letterSpacing: `${normalizedState.letterSpacing}px`,
    lineHeight: normalizedState.lineHeight,
    WebkitTextStroke: strokeStyle.WebkitTextStroke,
    textShadow: strokeStyle.textShadow,
  }
}

// 根据浏览器回读的 font-family，尽量匹配回预设字体列表中的某一项。
export function resolveFontFamily(value) {
  const normalizedValue = normalizeFontFamily(value)

  const matchedOption = FONT_FAMILY_OPTIONS.find((option) =>
    option.aliases.some((alias) => normalizedValue.includes(alias)),
  )

  return matchedOption?.value ?? DEFAULT_STYLE_STATE.fontFamily
}

// 根据描边位置生成不同的样式方案：
// center 使用原生 text-stroke；
// outside 使用多方向 text-shadow 近似外描边；
// inside 使用更细的描边做视觉近似。
function getStrokeStyle(state) {
  const width = clampNumber(state.strokeWidth, DEFAULT_STYLE_STATE.strokeWidth, 0, MAX_STROKE_WIDTH)

  if (!Number.isFinite(width) || width <= 0) {
    return {
      WebkitTextStroke: '0px transparent',
      textShadow: 'none',
    }
  }

  if (state.strokePosition === 'outside') {
    return {
      WebkitTextStroke: '0px transparent',
      textShadow: buildOutsideTextShadow(width, state.strokeColor),
    }
  }

  if (state.strokePosition === 'inside') {
    return {
      WebkitTextStroke: `${Number(Math.max(0.5, width * 0.6).toFixed(2))}px ${state.strokeColor}`,
      textShadow: '0 0 0 transparent',
    }
  }

  return {
    WebkitTextStroke: `${width}px ${state.strokeColor}`,
    textShadow: 'none',
  }
}

function clampNumber(value, fallback, min, max, options = {}) {
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number)) {
    return fallback
  }

  const clamped = Math.min(max, Math.max(min, number))
  const rounded = options.integer ? Math.round(clamped) : Number(clamped.toFixed(2))
  return Object.is(rounded, -0) ? 0 : rounded
}

function toPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value
}

function normalizeBoolean(value, fallback) {
  // v-model 或外部 JSON 可能把布尔值序列化成字符串，显式识别后再回退默认值。
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') {
      return true
    }

    if (normalized === 'false') {
      return false
    }
  }

  return fallback
}

function normalizeFontFamilyValue(value, fallback) {
  const text = String(value ?? '').trim()
  // font-family 允许逗号和引号，但不允许 url()/expression() 等可执行或外链片段。
  if (!text || text.length > MAX_FONT_FAMILY_LENGTH || hasUnsafeCssText(text)) {
    return fallback
  }

  return text
}

function normalizeCssTextValue(value, fallback) {
  const text = String(value ?? '').trim()
  if (!text || text.length > 160 || hasUnsafeCssText(text) || /["']/.test(text)) {
    return fallback
  }

  return text
}

function hasUnsafeCssText(value) {
  return /[<>`]|(?:url\s*\(|expression\s*\(|javascript\s*:|data\s*:|@import|-moz-binding|behavior\s*:)/i.test(
    String(value ?? ''),
  )
}

// 通过多圈阴影模拟外描边效果。
function buildOutsideTextShadow(width, color) {
  const shadows = []
  const rings = Math.max(1, Math.round(width))
  const angles = 12

  for (let radius = 1; radius <= rings; radius += 1) {
    for (let index = 0; index < angles; index += 1) {
      const angle = (Math.PI * 2 * index) / angles
      const x = Number((Math.cos(angle) * radius).toFixed(2))
      const y = Number((Math.sin(angle) * radius).toFixed(2))
      shadows.push(`${x}px ${y}px 0 ${color}`)
    }
  }

  return shadows.join(', ')
}

// 统一清洗字体串，便于和 aliases 做大小写无关的模糊匹配。
function normalizeFontFamily(value) {
  return String(value ?? '')
    .toLowerCase()
    .replaceAll('"', '')
    .replaceAll("'", '')
    .replace(/\s+/g, ' ')
    .trim()
}
