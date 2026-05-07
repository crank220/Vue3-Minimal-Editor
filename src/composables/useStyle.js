// 这个模块负责：
// 1. 维护插件默认配置；
// 2. 把传入 props 规范化成稳定状态；
// 3. 提供 DOM/Canvas 共享的样式转换工具。

// 字体下拉选项。aliases 用于把浏览器回读的 font-family 反解成工具栏中的预设项。
export const FONT_FAMILY_OPTIONS = [
  {
    label: '思源黑体',
    value:
      "'Source Han Sans SC', 'Source Han Sans CN', 'Noto Sans CJK SC', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    aliases: [
      'source han sans sc',
      'source han sans cn',
      'source han sans',
      'noto sans cjk sc',
      'noto sans sc',
      '思源黑体',
    ],
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

export const DEFAULT_STYLE_STATE = {
  fontSize: 24,
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

export const DEFAULT_EDITOR_BOX_STATE = {
  width: 960,
  height: 540,
  paddingTop: 20,
  paddingRight: 24,
  paddingBottom: 20,
  paddingLeft: 24,
}

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

// surfaceTheme 控制 editor / preview-viewport / cut-preview-item 的共享外观。
// 这里的配置会统一映射到 CSS 变量，避免三处分别维护容器样式。
export const DEFAULT_SURFACE_THEME = {
  fontFamily: DEFAULT_STYLE_STATE.fontFamily,
  fontSize: DEFAULT_STYLE_STATE.fontSize,
  lineHeight: DEFAULT_STYLE_STATE.lineHeight,
  background: '#ffffff',
  borderColor: 'rgba(24, 33, 47, 0.08)',
  borderRadius: 20,
  insetShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8)',
}

const TEXT_ALIGN_VALUES = new Set(['left', 'center', 'right', 'justify'])
const VERTICAL_ALIGN_VALUES = new Set(['flex-start', 'center', 'flex-end'])
const STROKE_POSITION_VALUES = new Set(['inside', 'center', 'outside'])
const PREVIEW_FORMAT_VALUES = new Set(['multiline', 'singleline'])
const PAGE_DIRECTION_VALUES = new Set(['static', 'left', 'right', 'up', 'down'])
const SINGLE_LINE_MODE_VALUES = new Set(['static', 'left', 'right'])

export function createStyleConfig(overrides = {}) {
  return normalizeStyleConfig({
    ...DEFAULT_STYLE_STATE,
    ...(overrides ?? {}),
  })
}

export function createEditorBoxConfig(overrides = {}) {
  return normalizeEditorBoxConfig({
    ...DEFAULT_EDITOR_BOX_STATE,
    ...(overrides ?? {}),
  })
}

export function createPreviewConfig(overrides = {}, editorWidth = DEFAULT_EDITOR_BOX_STATE.width) {
  return normalizePreviewConfig(
    {
      ...DEFAULT_PREVIEW_STATE,
      ...(overrides ?? {}),
    },
    editorWidth,
  )
}

export function createSurfaceTheme(overrides = {}) {
  return normalizeSurfaceTheme({
    ...DEFAULT_SURFACE_THEME,
    ...(overrides ?? {}),
  })
}

export function normalizeStyleConfig(state = {}) {
  return {
    fontSize: clampInteger(state.fontSize, DEFAULT_STYLE_STATE.fontSize, { min: 8, max: 512 }),
    fontFamily: normalizeFontFamilyValue(state.fontFamily, DEFAULT_STYLE_STATE.fontFamily),
    color: normalizeColorValue(state.color, DEFAULT_STYLE_STATE.color),
    background:
      state.background === 'transparent'
        ? 'transparent'
        : normalizeColorValue(state.background, DEFAULT_STYLE_STATE.background),
    bold: Boolean(state.bold),
    italic: Boolean(state.italic),
    underline: Boolean(state.underline),
    letterSpacing: clampNumber(state.letterSpacing, DEFAULT_STYLE_STATE.letterSpacing, {
      min: -10,
      max: 30,
      precision: 2,
    }),
    lineHeight: clampNumber(state.lineHeight, DEFAULT_STYLE_STATE.lineHeight, {
      min: 1,
      max: 3,
      precision: 2,
    }),
    strokeColor: normalizeColorValue(state.strokeColor, DEFAULT_STYLE_STATE.strokeColor),
    strokeWidth: clampNumber(state.strokeWidth, DEFAULT_STYLE_STATE.strokeWidth, {
      min: 0,
      max: 12,
      precision: 2,
    }),
    strokePosition: normalizeEnumValue(
      state.strokePosition,
      STROKE_POSITION_VALUES,
      DEFAULT_STYLE_STATE.strokePosition,
    ),
    textAlign: normalizeEnumValue(state.textAlign, TEXT_ALIGN_VALUES, DEFAULT_STYLE_STATE.textAlign),
    verticalAlign: normalizeEnumValue(
      state.verticalAlign,
      VERTICAL_ALIGN_VALUES,
      DEFAULT_STYLE_STATE.verticalAlign,
    ),
  }
}

export function normalizeEditorBoxConfig(state = {}) {
  return {
    width: clampInteger(state.width, DEFAULT_EDITOR_BOX_STATE.width, { min: 120, max: 65536 }),
    height: clampInteger(state.height, DEFAULT_EDITOR_BOX_STATE.height, { min: 120, max: 65536 }),
    paddingTop: clampInteger(state.paddingTop, DEFAULT_EDITOR_BOX_STATE.paddingTop, { min: 0, max: 4096 }),
    paddingRight: clampInteger(state.paddingRight, DEFAULT_EDITOR_BOX_STATE.paddingRight, { min: 0, max: 4096 }),
    paddingBottom: clampInteger(state.paddingBottom, DEFAULT_EDITOR_BOX_STATE.paddingBottom, { min: 0, max: 4096 }),
    paddingLeft: clampInteger(state.paddingLeft, DEFAULT_EDITOR_BOX_STATE.paddingLeft, { min: 0, max: 4096 }),
  }
}

export function normalizePreviewConfig(state = {}, editorWidth = DEFAULT_EDITOR_BOX_STATE.width) {
  return {
    format: normalizeEnumValue(state.format, PREVIEW_FORMAT_VALUES, DEFAULT_PREVIEW_STATE.format),
    pageTransitionDirection: normalizeEnumValue(
      state.pageTransitionDirection,
      PAGE_DIRECTION_VALUES,
      DEFAULT_PREVIEW_STATE.pageTransitionDirection,
    ),
    pageTransitionMs: clampInteger(state.pageTransitionMs, DEFAULT_PREVIEW_STATE.pageTransitionMs, {
      min: 0,
      max: 999999,
    }),
    pageStaySeconds: clampInteger(state.pageStaySeconds, DEFAULT_PREVIEW_STATE.pageStaySeconds, {
      min: 1,
      max: 9999,
    }),
    cutImageWidth: clampInteger(state.cutImageWidth, editorWidth || DEFAULT_PREVIEW_STATE.cutImageWidth, {
      min: 1,
      max: 65536,
    }),
    singleLineMode: normalizeEnumValue(
      state.singleLineMode,
      SINGLE_LINE_MODE_VALUES,
      DEFAULT_PREVIEW_STATE.singleLineMode,
    ),
    singleLineSpeed: clampInteger(state.singleLineSpeed, DEFAULT_PREVIEW_STATE.singleLineSpeed, {
      min: 1,
      max: 9,
    }),
    singleLineSeamless: Boolean(state.singleLineSeamless),
  }
}

export function normalizeSurfaceTheme(state = {}) {
  return {
    fontFamily: normalizeFontFamilyValue(state.fontFamily, DEFAULT_SURFACE_THEME.fontFamily),
    fontSize: clampInteger(state.fontSize, DEFAULT_SURFACE_THEME.fontSize, { min: 8, max: 512 }),
    lineHeight: clampNumber(state.lineHeight, DEFAULT_SURFACE_THEME.lineHeight, {
      min: 1,
      max: 3,
      precision: 2,
    }),
    background: state.background || DEFAULT_SURFACE_THEME.background,
    borderColor: state.borderColor || DEFAULT_SURFACE_THEME.borderColor,
    borderRadius: clampInteger(state.borderRadius, DEFAULT_SURFACE_THEME.borderRadius, {
      min: 0,
      max: 999,
    }),
    insetShadow: String(state.insetShadow || DEFAULT_SURFACE_THEME.insetShadow),
  }
}

export function toPlainState(state) {
  return {
    ...(state ?? {}),
  }
}

// 把当前工具栏状态转换成可直接写入 DOM 的样式对象。
export function styleToCss(state) {
  const strokeStyle = getStrokeStyle(state)

  return {
    fontSize: `${state.fontSize}px`,
    fontFamily: state.fontFamily,
    color: state.color,
    background: state.background,
    fontWeight: state.bold ? 'bold' : 'normal',
    fontStyle: state.italic ? 'italic' : 'normal',
    textDecoration: state.underline ? 'underline' : 'none',
    letterSpacing: `${state.letterSpacing}px`,
    lineHeight: state.lineHeight,
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

function getStrokeStyle(state) {
  const width = Number.parseFloat(state.strokeWidth)

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

function normalizeFontFamilyValue(value, fallback) {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function normalizeColorValue(value, fallback) {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

function normalizeEnumValue(value, allowedValues, fallback) {
  return allowedValues.has(value) ? value : fallback
}

function clampInteger(value, fallback, { min, max }) {
  const number = Number.parseInt(value, 10)
  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.round(number)))
}

function clampNumber(value, fallback, { min, max, precision = 2 }) {
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number)) {
    return fallback
  }

  return Number(Math.min(max, Math.max(min, number)).toFixed(precision))
}

function normalizeFontFamily(value) {
  return String(value ?? '')
    .toLowerCase()
    .replaceAll('"', '')
    .replaceAll("'", '')
    .replace(/\s+/g, ' ')
    .trim()
}
