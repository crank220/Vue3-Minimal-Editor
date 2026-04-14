import { reactive } from 'vue'

export const FONT_FAMILY_OPTIONS = [
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

export const styleState = reactive({
  ...DEFAULT_STYLE_STATE,
})

export const editorBoxState = reactive({
  ...DEFAULT_EDITOR_BOX_STATE,
})

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

function normalizeFontFamily(value) {
  return String(value ?? '')
    .toLowerCase()
    .replaceAll('"', '')
    .replaceAll("'", '')
    .replace(/\s+/g, ' ')
    .trim()
}
