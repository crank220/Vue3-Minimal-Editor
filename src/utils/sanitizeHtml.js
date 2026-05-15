import {
  MAX_FONT_FAMILY_LENGTH,
  MAX_LETTER_SPACING,
  MAX_LINE_HEIGHT,
  MAX_STROKE_WIDTH,
  MAX_TEXT_FONT_SIZE,
  MAX_TEXT_SHADOW_COUNT,
  MAX_TEXT_SHADOW_OFFSET,
  MIN_LETTER_SPACING,
  MIN_LINE_HEIGHT,
  MIN_TEXT_FONT_SIZE,
} from '../composables/useStyle'
import { parseCssTextShadow } from './cssTextShadow'

const ALLOWED_TAGS = new Set(['BR', 'SPAN'])
const DROP_WITH_CONTENT_TAGS = new Set([
  'IFRAME',
  'SCRIPT',
  'STYLE',
  'OBJECT',
  'EMBED',
  'LINK',
  'META',
  'SVG',
  'MATH',
  'TEMPLATE',
])
const ALLOWED_STYLE_PROPERTIES = new Set([
  '-webkit-text-stroke',
  '-webkit-text-stroke-color',
  '-webkit-text-stroke-width',
  'background',
  'background-color',
  'color',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'line-height',
  'text-decoration',
  'text-decoration-line',
  'text-shadow',
])
const ALLOWED_STROKE_POSITIONS = new Set(['inside', 'center', 'outside'])
const DANGEROUS_STYLE_VALUE_PATTERN =
  /(?:url\s*\(|expression\s*\(|javascript\s*:|data\s*:|@import|-moz-binding|behavior\s*:)/i
const SAFE_TEXT_SHADOW_COLOR_PATTERN =
  /^(?:#[0-9a-f]{3,8}|[a-z]+|rgba?\(\s*\d{1,3}(?:\s*,\s*|\s+)\d{1,3}(?:\s*,\s*|\s+)\d{1,3}(?:(?:\s*,\s*|\s*\/\s*)(?:0|1|0?\.\d+))?\s*\))$/i

export function sanitizeEditorHtml(value) {
  const source = String(value ?? '')

  if (typeof document === 'undefined') {
    // SSR 或测试环境没有 DOMParser 时，把输入降级为纯文本并保留换行。
    return escapeHtml(source).replace(/\r?\n/g, '<br>')
  }

  const template = document.createElement('template')
  template.innerHTML = source

  const container = document.createElement('div')
  container.appendChild(sanitizeChildNodes(template.content))

  return container.innerHTML
}

export function sanitizeStyleText(styleText) {
  if (typeof document === 'undefined') {
    return ''
  }

  const source = String(styleText ?? '').trim()
  if (!source) {
    return ''
  }

  const probe = document.createElement('span')
  const output = document.createElement('span')
  probe.setAttribute('style', source)

  // 先交给浏览器 CSSOM 解析，再逐项复制白名单属性，避免手写解析接受畸形 CSS。
  Array.from(probe.style).forEach((property) => {
    const normalizedProperty = property.toLowerCase()
    const value = probe.style.getPropertyValue(property).trim()
    const safeValue = normalizeStyleProperty(normalizedProperty, value)

    if (
      !ALLOWED_STYLE_PROPERTIES.has(normalizedProperty) ||
      !safeValue ||
      isDangerousStyleValue(value)
    ) {
      return
    }

    output.style.setProperty(normalizedProperty, safeValue)
  })

  return output.getAttribute('style') ?? ''
}

function normalizeStyleProperty(property, value) {
  if (property === 'font-size') {
    return `${clampCssNumber(value, MIN_TEXT_FONT_SIZE, MAX_TEXT_FONT_SIZE, 24, { integer: true })}px`
  }

  if (property === 'font-family') {
    return normalizeTextCssValue(value, MAX_FONT_FAMILY_LENGTH, { allowQuotes: true })
  }

  if (property === 'letter-spacing') {
    return `${clampCssNumber(value, MIN_LETTER_SPACING, MAX_LETTER_SPACING, 0)}px`
  }

  if (property === 'line-height') {
    return String(clampCssNumber(value, MIN_LINE_HEIGHT, MAX_LINE_HEIGHT, 1.5))
  }

  if (property === '-webkit-text-stroke-width') {
    return `${clampCssNumber(value, 0, MAX_STROKE_WIDTH, 0)}px`
  }

  if (property === '-webkit-text-stroke') {
    return normalizeTextStroke(value)
  }

  if (property === 'text-shadow') {
    return normalizeTextShadow(value)
  }

  if (property === 'font-weight') {
    return normalizeFontWeight(value)
  }

  if (property === 'font-style') {
    return value === 'italic' || value === 'normal' ? value : ''
  }

  if (property === 'text-decoration' || property === 'text-decoration-line') {
    return normalizeTextDecoration(value)
  }

  return normalizeTextCssValue(value, 160)
}

function normalizeTextStroke(value) {
  const parts = String(value ?? '').trim().split(/\s+/)
  const width = clampCssNumber(parts[0], 0, MAX_STROKE_WIDTH, 0)
  const color = normalizeTextCssValue(parts.slice(1).join(' '), 160)

  if (width <= 0 || !color) {
    return '0px transparent'
  }

  return `${width}px ${color}`
}

function normalizeTextShadow(value) {
  // text-shadow 支持逗号分隔的多层阴影，先按 CSS 语义拆分再逐项限流。
  const shadows = parseCssTextShadow(value)
    .slice(0, MAX_TEXT_SHADOW_COUNT)
    .map(normalizeTextShadowEntry)
    .filter(Boolean)

  return shadows.join(', ')
}

function normalizeTextShadowEntry(entry) {
  const x = clampCssNumber(entry.x, -MAX_TEXT_SHADOW_OFFSET, MAX_TEXT_SHADOW_OFFSET, 0)
  const y = clampCssNumber(entry.y, -MAX_TEXT_SHADOW_OFFSET, MAX_TEXT_SHADOW_OFFSET, 0)
  const blur = clampCssNumber(entry.blur, 0, MAX_TEXT_SHADOW_OFFSET, 0)
  const color = normalizeTextShadowColor(entry.color)

  return color ? `${x}px ${y}px ${blur}px ${color}` : ''
}

function normalizeTextShadowColor(value) {
  const text = normalizeTextCssValue(value, 80)
  if (!text || !SAFE_TEXT_SHADOW_COLOR_PATTERN.test(text)) {
    return ''
  }

  return text
}

function normalizeFontWeight(value) {
  if (value === 'normal' || value === 'bold') {
    return value
  }

  const weight = Number.parseInt(value, 10)
  if (!Number.isFinite(weight)) {
    return ''
  }

  return String(Math.min(900, Math.max(100, Math.round(weight / 100) * 100)))
}

function normalizeTextDecoration(value) {
  const allowed = String(value ?? '')
    .split(/\s+/)
    .filter((item) => item === 'none' || item === 'underline')

  if (allowed.includes('underline')) {
    return 'underline'
  }

  return allowed.includes('none') ? 'none' : ''
}

function normalizeTextCssValue(value, maxLength, options = {}) {
  const text = String(value ?? '').trim()
  const unsafeCharacters = options.allowQuotes ? /[<>`]/ : /[<>"'`]/

  if (!text || text.length > maxLength || isDangerousStyleValue(text) || unsafeCharacters.test(text)) {
    return ''
  }

  return text
}

function clampCssNumber(value, min, max, fallback, options = {}) {
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number)) {
    return fallback
  }

  const clamped = Math.min(max, Math.max(min, number))
  const rounded = options.integer ? Math.round(clamped) : Number(clamped.toFixed(2))
  return Object.is(rounded, -0) ? 0 : rounded
}

function sanitizeChildNodes(parent) {
  const fragment = document.createDocumentFragment()

  Array.from(parent.childNodes).forEach((child) => {
    const sanitizedNode = sanitizeNode(child)
    if (sanitizedNode) {
      fragment.appendChild(sanitizedNode)
    }
  })

  return fragment
}

function sanitizeNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent ?? '')
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null
  }

  const tagName = node.tagName

  if (DROP_WITH_CONTENT_TAGS.has(tagName)) {
    // 可执行、可嵌入外部资源或会改变解析上下文的标签连同内容一起丢弃。
    return null
  }

  if (!ALLOWED_TAGS.has(tagName)) {
    // b/i/div 等结构性标签不保留标签本身，只递归保留其中的安全文本和 span/br。
    return sanitizeChildNodes(node)
  }

  if (tagName === 'BR') {
    return document.createElement('br')
  }

  const span = document.createElement('span')
  const styleText = sanitizeStyleText(node.getAttribute('style'))

  if (styleText) {
    span.setAttribute('style', styleText)
  }

  applySafeStrokeDataset(node, span)
  span.appendChild(sanitizeChildNodes(node))

  return span
}

function applySafeStrokeDataset(source, target) {
  // 描边位置是编辑器自定义语义，不能通过 CSSOM 表达，所以单独复制安全 dataset。
  const width = Number.parseFloat(source.getAttribute('data-stroke-width'))
  const color = sanitizeDatasetValue(source.getAttribute('data-stroke-color'))
  const position = source.getAttribute('data-stroke-position')

  if (
    !Number.isFinite(width) ||
    width <= 0 ||
    width > 12 ||
    !color ||
    !ALLOWED_STROKE_POSITIONS.has(position)
  ) {
    return
  }

  target.dataset.strokeWidth = String(Number(width.toFixed(2)))
  target.dataset.strokeColor = color
  target.dataset.strokePosition = position
}

function sanitizeDatasetValue(value) {
  const text = String(value ?? '').trim()

  if (!text || text.length > 100 || isDangerousStyleValue(text) || /[<>"'`]/.test(text)) {
    return ''
  }

  return text
}

function isDangerousStyleValue(value) {
  return DANGEROUS_STYLE_VALUE_PATTERN.test(String(value ?? ''))
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
