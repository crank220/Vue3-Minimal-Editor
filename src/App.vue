<script setup>
// 完整 demo 入口：
// 1. 通过 v-model:html / v-model:annotations 演示受控入参；
// 2. 监听 update、screenshot、screenshots 事件并输出事件流水；
// 3. 使用 annotation-actions / annotation-preview 插槽替换部分默认工具栏。
import { computed, ref } from 'vue'
import HdTextEditor from './components/RichTextEditor.vue'
import { createTextEditorAnnotations } from './composables/useStyle'

const DEMO_HTML = [
  '<span style="font-size: 32px; font-weight: bold; color: #0f172a; background: #d9f99d; line-height: 1.4;">HD Text Editor Demo</span>',
  '<br>',
  '<span style="font-size: 24px; color: #1f2937; line-height: 1.6;">这是一份完整演示：外部传入 html 和 annotations，编辑器内部变更会同步回抛。</span>',
  '<br>',
  '<span style="font-size: 22px; color: #0f766e; line-height: 1.6;">选中文本后点击自定义 slot 按钮，样式会立即写回当前 HTML。</span>',
].join('')

const editorRef = ref(null)
const demoHtml = ref(DEMO_HTML)
const demoAnnotations = ref(createDemoAnnotations())
const eventLogs = ref([])
const screenshotFiles = ref([])
let eventId = 0

const htmlLength = computed(() => demoHtml.value.length)
const screenshotCount = computed(() => screenshotFiles.value.length)
const annotationsSnapshot = computed(() => JSON.stringify(demoAnnotations.value, null, 2))

function createDemoAnnotations() {
  // demo 默认值保持在当前页面可视范围内，便于本地浏览器直接核对入参与预览。
  return createTextEditorAnnotations({
    style: {
      fontSize: 24,
      color: '#0f172a',
      background: '#ffffff',
      lineHeight: 1.5,
      textAlign: 'left',
      verticalAlign: 'center',
    },
    editorBox: {
      width: 760,
      height: 320,
      paddingTop: 24,
      paddingRight: 28,
      paddingBottom: 24,
      paddingLeft: 28,
    },
    preview: {
      format: 'multiline',
      pageTransitionDirection: 'static',
      pageTransitionMs: 100,
      pageStaySeconds: 4,
      cutImageWidth: 520,
    },
  })
}

function logEvent(type, detail) {
  // demo 事件面板只保留短摘要，避免把完整 html / dataURL 刷满界面。
  eventLogs.value.unshift({
    id: `${Date.now()}-${eventId++}`,
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    type,
    detail,
  })
  eventLogs.value = eventLogs.value.slice(0, 8)
}

function formatDetail(detail) {
  return JSON.stringify(detail)
}

function handleHtmlUpdate(value) {
  logEvent('update:html', {
    length: value.length,
    preview: value.replace(/<[^>]+>/g, '').slice(0, 28),
  })
}

function handleAnnotationsUpdate(value) {
  logEvent('update:annotations', {
    fontSize: value.style.fontSize,
    format: value.preview.format,
    size: `${value.editorBox.width} x ${value.editorBox.height}`,
  })
}

function handleScreenshot(payload) {
  logEvent('screenshot', {
    index: payload.index,
    size: `${payload.width} x ${payload.height}`,
    file: payload.file?.name ?? 'image.png',
  })
}

function handleScreenshots(payloads) {
  screenshotFiles.value = payloads
  logEvent('screenshots', {
    count: payloads.length,
  })
}

async function captureFromInstance() {
  const payloads = (await editorRef.value?.screenshot?.()) ?? []
  logEvent('method:screenshot', {
    count: payloads.length,
  })
}

function loadMultilinePreset() {
  // 外部直接替换 annotations，演示父组件作为受控方更新入参。
  demoAnnotations.value = createTextEditorAnnotations({
    ...demoAnnotations.value,
    editorBox: {
      ...demoAnnotations.value.editorBox,
      width: 760,
      height: 320,
    },
    preview: {
      ...demoAnnotations.value.preview,
      format: 'multiline',
      pageTransitionDirection: 'up',
      pageTransitionMs: 300,
      pageStaySeconds: 3,
    },
  })
  logEvent('preset:multiline', { motion: 'up' })
}

function loadSinglelinePreset() {
  // 单行预设同时替换 html 和 annotations，用来验证两个受控入参联动。
  demoHtml.value =
    '<span style="font-size: 30px; color: #7c2d12; background: #fed7aa; line-height: 1.4;">单行滚动演示 / HTML 由外部入参替换 / Slot 按钮仍然可触发截图</span>'
  demoAnnotations.value = createTextEditorAnnotations({
    ...demoAnnotations.value,
    editorBox: {
      ...demoAnnotations.value.editorBox,
      width: 760,
      height: 120,
      paddingTop: 18,
      paddingBottom: 18,
    },
    preview: {
      ...demoAnnotations.value.preview,
      format: 'singleline',
      singleLineMode: 'left',
      singleLineSpeed: 4,
      singleLineSeamless: true,
      cutImageWidth: 360,
    },
  })
  logEvent('preset:singleline', { mode: 'left' })
}

function resetDemo() {
  demoHtml.value = DEMO_HTML
  demoAnnotations.value = createDemoAnnotations()
  screenshotFiles.value = []
  logEvent('reset', { source: 'demo' })
}

function resetSlotStyle(style) {
  // slot 中直接改的是编辑器内部响应式 style，对当前缓存选区即时生效。
  Object.assign(style, createTextEditorAnnotations().style)
}
</script>

<template>
  <main class="demo-shell">
    <section class="demo-topbar">
      <div>
        <p class="demo-eyebrow">hd-text-editor</p>
        <h1>Props · Events · Slots</h1>
      </div>

      <div class="demo-metrics">
        <span>HTML {{ htmlLength }}</span>
        <span>PNG {{ screenshotCount }}</span>
      </div>
    </section>

    <section class="demo-console">
      <div class="demo-panel props-panel">
        <div class="panel-heading">
          <h2>入参</h2>
          <div class="panel-actions">
            <button type="button" @click="loadMultilinePreset">Multiline</button>
            <button type="button" @click="loadSinglelinePreset">Single line</button>
            <button type="button" @click="resetDemo">Reset</button>
            <button type="button" class="primary-action" @click="captureFromInstance">Screenshot</button>
          </div>
        </div>

        <label class="wide-field">
          HTML
          <textarea v-model="demoHtml" spellcheck="false" />
        </label>

        <div class="input-grid">
          <label>
            Width
            <input v-model.number="demoAnnotations.editorBox.width" type="number" min="120" />
          </label>
          <label>
            Height
            <input v-model.number="demoAnnotations.editorBox.height" type="number" min="120" />
          </label>
          <label>
            Font size
            <input v-model.number="demoAnnotations.style.fontSize" type="number" min="12" />
          </label>
          <label>
            Format
            <select v-model="demoAnnotations.preview.format">
              <option value="multiline">multiline</option>
              <option value="singleline">singleline</option>
            </select>
          </label>
        </div>
      </div>

      <div class="demo-panel event-panel">
        <h2>事件</h2>
        <ol class="event-list">
          <li v-for="item in eventLogs" :key="item.id">
            <span>{{ item.time }}</span>
            <strong>{{ item.type }}</strong>
            <code>{{ formatDetail(item.detail) }}</code>
          </li>
          <li v-if="eventLogs.length === 0" class="empty-event">Waiting</li>
        </ol>
      </div>

      <div class="demo-panel state-panel">
        <h2>annotations</h2>
        <pre>{{ annotationsSnapshot }}</pre>
      </div>
    </section>

    <HdTextEditor
      ref="editorRef"
      v-model:html="demoHtml"
      v-model:annotations="demoAnnotations"
      @update:html="handleHtmlUpdate"
      @update:annotations="handleAnnotationsUpdate"
      @screenshot="handleScreenshot"
      @screenshots="handleScreenshots"
    >
      <template #annotation-actions="{ style }">
        <div class="demo-slot-group">
          <button type="button" :class="{ active: style.bold }" @mousedown.prevent @click="style.bold = !style.bold">
            B
          </button>
          <button
            type="button"
            :class="{ active: style.italic }"
            @mousedown.prevent
            @click="style.italic = !style.italic"
          >
            I
          </button>
          <button
            type="button"
            :class="{ active: style.underline }"
            @mousedown.prevent
            @click="style.underline = !style.underline"
          >
            U
          </button>
          <button type="button" @mousedown.prevent @click="resetSlotStyle(style)">Reset style</button>
        </div>
      </template>

      <template #annotation-preview="{ preview, cutImages }">
        <div class="demo-slot-group preview-slot">
          <label>
            Format
            <select v-model="preview.format">
              <option value="multiline">Multiline</option>
              <option value="singleline">Single line</option>
            </select>
          </label>

          <label v-if="preview.format === 'multiline'">
            Motion
            <select v-model="preview.pageTransitionDirection">
              <option value="static">Static</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
            </select>
          </label>

          <label v-else>
            Speed
            <select v-model.number="preview.singleLineSpeed">
              <option v-for="speed in 9" :key="speed" :value="speed">{{ speed }}</option>
            </select>
          </label>

          <button type="button" class="primary-action" @mousedown.prevent @click="cutImages">Cut PNG</button>
        </div>
      </template>
    </HdTextEditor>
  </main>
</template>

<style scoped>
/* demo 外壳让本地页面展示完整插件接入，而不是只挂载裸组件。 */
.demo-shell {
  width: min(1280px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 24px 0 48px;
}

.demo-topbar,
.demo-console,
.demo-panel {
  border: 1px solid rgba(24, 33, 47, 0.1);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 16px 48px rgba(34, 49, 74, 0.1);
}

.demo-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-radius: 18px;
}

.demo-eyebrow {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 700;
  color: #0f766e;
  text-transform: uppercase;
}

h1,
h2 {
  margin: 0;
  color: #172033;
  line-height: 1.15;
}

h1 {
  font-size: 28px;
}

h2 {
  font-size: 15px;
}

.demo-metrics,
.panel-actions,
.demo-slot-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.demo-metrics span {
  padding: 8px 12px;
  border-radius: 999px;
  background: #ecfeff;
  color: #155e75;
  font-size: 13px;
  font-weight: 700;
}

.demo-console {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(260px, 0.85fr) minmax(280px, 0.9fr);
  gap: 12px;
  margin-top: 14px;
  padding: 12px;
  border-radius: 18px;
}

.demo-panel {
  min-width: 0;
  padding: 14px;
  border-radius: 12px;
}

.panel-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

label {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: #4b5b70;
}

textarea,
input,
select,
button {
  border: 1px solid rgba(24, 33, 47, 0.14);
  border-radius: 10px;
  background: #ffffff;
  color: #18212f;
}

textarea {
  min-height: 112px;
  resize: vertical;
  padding: 10px;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 12px;
}

input,
select {
  min-height: 36px;
  padding: 0 10px;
}

button {
  min-height: 36px;
  padding: 0 12px;
  font-weight: 700;
}

button.active,
.primary-action {
  border-color: rgba(15, 118, 110, 0.45);
  background: #ccfbf1;
  color: #115e59;
}

.wide-field {
  margin-top: 12px;
}

.input-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.event-list {
  display: grid;
  gap: 8px;
  max-height: 236px;
  margin: 12px 0 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.event-list li {
  display: grid;
  gap: 4px;
  padding: 8px;
  border-radius: 10px;
  background: #f8fafc;
}

.event-list span {
  font-size: 11px;
  color: #64748b;
}

.event-list strong {
  font-size: 12px;
  color: #0f766e;
}

code,
pre {
  font-family: Consolas, 'Courier New', monospace;
  font-size: 11px;
}

code {
  overflow: hidden;
  color: #334155;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-event {
  color: #64748b;
}

pre {
  max-height: 236px;
  margin: 12px 0 0;
  overflow: auto;
  color: #334155;
  white-space: pre-wrap;
}

.demo-slot-group {
  padding: 8px;
  border-radius: 18px;
  background: rgba(15, 118, 110, 0.08);
}

.preview-slot label {
  min-width: 112px;
}

/* demo 页面把编辑器宽度交给外层控制，避免小屏出现整页横向滚动。 */
:deep(.editor-shell) {
  width: 100%;
  padding: 16px 0 0;
}

:deep(.workspace-card) {
  margin-top: 0;
}

@media (max-width: 980px) {
  .demo-console {
    grid-template-columns: 1fr;
  }

  .input-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .demo-shell {
    width: min(100vw - 20px, 1280px);
    padding-top: 12px;
  }

  .demo-topbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .input-grid {
    grid-template-columns: 1fr;
  }
}
</style>
