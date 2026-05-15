import { describe, expect, it } from 'vitest'
import {
  MAX_CANVAS_DIMENSION,
  MAX_EDITOR_DIMENSION,
  MAX_EDITOR_PADDING,
  MAX_STROKE_WIDTH,
  MAX_TEXT_FONT_SIZE,
  MIN_EDITOR_DIMENSION,
  createTextEditorAnnotations,
  normalizeEditorBox,
  normalizePreviewConfig,
  normalizeTextStyle,
} from '../../src/composables/useStyle'

describe('normalizeTextStyle', () => {
  it('clamps external annotation style values before they reach the editor', () => {
    const style = normalizeTextStyle({
      fontSize: 9999,
      fontFamily: 'x'.repeat(300),
      letterSpacing: 999,
      lineHeight: 99,
      strokeWidth: 99,
      strokePosition: 'diagonal',
      textAlign: 'start',
      verticalAlign: 'middle',
    })

    expect(style.fontSize).toBe(MAX_TEXT_FONT_SIZE)
    expect(style.fontFamily).not.toBe('x'.repeat(300))
    expect(style.letterSpacing).toBe(30)
    expect(style.lineHeight).toBe(3)
    expect(style.strokeWidth).toBe(MAX_STROKE_WIDTH)
    expect(style.strokePosition).toBe('center')
    expect(style.textAlign).toBe('left')
    expect(style.verticalAlign).toBe('center')
  })

  it('normalizes string booleans without forcing them to true', () => {
    const style = normalizeTextStyle({
      bold: 'false',
      italic: 'false',
      underline: 'true',
    })

    expect(style.bold).toBe(false)
    expect(style.italic).toBe(false)
    expect(style.underline).toBe(true)
  })

  it('falls back to defaults for null or non-object public inputs', () => {
    expect(createTextEditorAnnotations(null)).toEqual(createTextEditorAnnotations())
    expect(createTextEditorAnnotations([])).toEqual(createTextEditorAnnotations())
    expect(normalizeTextStyle(null)).toEqual(createTextEditorAnnotations().style)
    expect(normalizeEditorBox(null)).toEqual(createTextEditorAnnotations().editorBox)
    expect(normalizePreviewConfig(null)).toEqual(createTextEditorAnnotations().preview)
  })

  it('normalizes style inside the public annotations factory', () => {
    const annotations = createTextEditorAnnotations({
      style: {
        fontSize: -100,
        strokeWidth: 100,
      },
    })

    expect(annotations.style.fontSize).toBe(1)
    expect(annotations.style.strokeWidth).toBe(MAX_STROKE_WIDTH)
  })

  it('normalizes editor box and preview config inside the public annotations factory', () => {
    const annotations = createTextEditorAnnotations({
      editorBox: {
        width: 999999,
        height: -10,
        paddingTop: 999999,
      },
      preview: {
        format: 'bad',
        pageTransitionDirection: 'diagonal',
        pageTransitionMs: 999999,
        pageStaySeconds: 999999,
        cutImageWidth: 999999,
        singleLineMode: 'bounce',
        singleLineSpeed: 999,
        singleLineSeamless: 'false',
      },
    })

    expect(annotations.editorBox.width).toBe(MAX_EDITOR_DIMENSION)
    expect(annotations.editorBox.height).toBe(MIN_EDITOR_DIMENSION)
    expect(annotations.editorBox.paddingTop).toBe(MAX_EDITOR_PADDING)
    expect(annotations.preview.format).toBe('multiline')
    expect(annotations.preview.pageTransitionDirection).toBe('static')
    expect(annotations.preview.pageTransitionMs).toBe(9999)
    expect(annotations.preview.pageStaySeconds).toBe(9999)
    expect(annotations.preview.cutImageWidth).toBe(MAX_CANVAS_DIMENSION)
    expect(annotations.preview.singleLineMode).toBe('static')
    expect(annotations.preview.singleLineSpeed).toBe(9)
    expect(annotations.preview.singleLineSeamless).toBe(false)
  })
})
