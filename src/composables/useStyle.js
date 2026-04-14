// 样式状态中心：
// 1. 定义工具栏可编辑的默认文本样式；
// 2. 定义编辑区盒模型和预览配置的默认值；
// 3. 提供把状态转换成内联 CSS 的工具函数。
import { reactive } from 'vue'

// 字体下拉选项。aliases 用于把浏览器回读的 font-family 反解成工具栏中的预设项。
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

// 当前选中文本的默认样式。
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

// 工具栏直接绑定的响应式文本样式状态。
export const styleState = reactive({
  ...DEFAULT_STYLE_STATE,
})

// 编辑区尺寸与 padding 的响应式状态。
export const editorBoxState = reactive({
  ...DEFAULT_EDITOR_BOX_STATE,
})

// 预览模式、翻页和切图参数的响应式状态。
export const previewState = reactive({
  ...DEFAULT_PREVIEW_STATE,
})

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

// 根据描边位置生成不同的样式方案：
// center 使用原生 text-stroke；
// outside 使用多方向 text-shadow 近似外描边；
// inside 使用更细的描边做视觉近似。
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
