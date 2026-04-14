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
  textAlign: 'left',
  verticalAlign: 'center',
}

export const styleState = reactive({
  ...DEFAULT_STYLE_STATE,
})

export function styleToCss(state) {
  return {
    fontSize: `${state.fontSize}px`,
    color: state.color,
    background: state.background,
    fontWeight: state.bold ? 'bold' : 'normal',
    fontStyle: state.italic ? 'italic' : 'normal',
    textDecoration: state.underline ? 'underline' : 'none',
    letterSpacing: `${state.letterSpacing}px`,
    lineHeight: state.lineHeight,
    WebkitTextStroke: `${state.strokeWidth}px ${state.strokeColor}`,
  }
}
