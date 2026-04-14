import { reactive } from 'vue'

export const DEFAULT_STYLE_STATE = {
  fontSize: 24,
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

export const styleState = reactive({
  ...DEFAULT_STYLE_STATE,
})

export function styleToCss(state) {
  const strokeStyle = getStrokeStyle(state)

  return {
    fontSize: `${state.fontSize}px`,
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
