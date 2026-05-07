<script setup>
import { ref } from 'vue'
import {
  HdTextEditor,
  createEditorBoxConfig,
  createPreviewConfig,
  createStyleConfig,
  createSurfaceTheme,
} from './lib'

const SAMPLE_ARTICLE_HTML = `
<span style="font-size: 24px; line-height: 1.5;">
  一个基于 <strong>Vue 3 + Vite</strong> 的文本编辑、实时预览、分页播放与 PNG 切图插件。
</span>
<br><br>
<span style="background: #ffe59a;">插件化后的重点不是把编辑器塞进 npm。</span>
<span style="color: #1d4ed8;">真正关键的是 editor、preview-viewport 与 cut-preview-item 继续共用同一份 HTML、同一组盒模型、同一套导出规则。</span>
<br><br>
<span style="font-style: italic;">这个 demo 同时也是当前插件的宿主测试页。</span>
`

const SAMPLE_BANNER_HTML = `
<span style="font-size: 32px; font-weight: bold; color: #0f172a;">hd-text-editor</span>
<span style="font-size: 32px; background: #bfdbfe; color: #1e3a8a;"> npm plugin demo </span>
<span style="font-size: 32px; letter-spacing: 3px;">ready</span>
`

const editorRef = ref(null)
const html = ref(SAMPLE_ARTICLE_HTML.trim())
const styleConfig = ref(createStyleConfig())
const editorBoxConfig = ref(createEditorBoxConfig())
const previewConfig = ref(createPreviewConfig())
const surfaceTheme = ref(createSurfaceTheme())
const lastEvent = ref('等待插件事件...')
const lastSnapshot = ref('等待读取快照...')
const lastCutSummary = ref('尚未触发切图。')

const demoUiStyleMap = {
  previewStage: {
    marginTop: '18px',
  },
  cutPreviewStage: {
    marginTop: '18px',
  },
}

function loadArticleDemo() {
  html.value = SAMPLE_ARTICLE_HTML.trim()
  previewConfig.value = createPreviewConfig({
    format: 'multiline',
    pageTransitionDirection: 'static',
  })
}

function loadBannerDemo() {
  html.value = SAMPLE_BANNER_HTML.trim()
  previewConfig.value = createPreviewConfig({
    format: 'singleline',
    cutImageWidth: 720,
    singleLineMode: 'left',
    singleLineSpeed: 3,
    singleLineSeamless: true,
  })
}

function applyPaperTheme() {
  surfaceTheme.value = createSurfaceTheme({
    background: '#ffffff',
    borderColor: 'rgba(24, 33, 47, 0.08)',
    borderRadius: 20,
    insetShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.8)',
  })
}

function applyNightTheme() {
  surfaceTheme.value = createSurfaceTheme({
    background: '#0f172a',
    borderColor: 'rgba(148, 163, 184, 0.35)',
    borderRadius: 24,
    insetShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  })
}

function focusEditor() {
  editorRef.value?.focus?.()
}

function replaceWithApiContent() {
  editorRef.value?.setHtml?.(
    `
<span style="font-size: 28px; font-weight: bold; color: #7c2d12;">API setHtml()</span>
<br><br>
<span style="background: #fed7aa;">这段内容是通过插件 ref 方法直接写入的。</span>
<span style="color: #1d4ed8;">你现在看到的是 demo 用真实宿主方式驱动插件。</span>
    `.trim(),
    'demo-api',
  )
}

function captureSnapshot() {
  const snapshot = editorRef.value?.getSnapshot?.()
  lastSnapshot.value = formatSnapshot(snapshot)
}

async function triggerCut() {
  const payload = await editorRef.value?.generateCutImages?.('demo-api')
  if (payload) {
    handleCutImages(payload)
  }
}

function handleReady(payload) {
  lastEvent.value = JSON.stringify(
    {
      event: 'ready',
      htmlLength: payload.snapshot.html.length,
    },
    null,
    2,
  )
  lastSnapshot.value = formatSnapshot(payload.snapshot)
}

function handleTextChange(payload) {
  lastEvent.value = JSON.stringify(
    {
      event: 'text-change',
      source: payload.source,
      htmlLength: payload.html.length,
    },
    null,
    2,
  )
}

function handleSelectionChange(payload) {
  lastEvent.value = JSON.stringify(
    {
      event: 'selection-change',
      source: payload.source,
      collapsed: payload.collapsed,
    },
    null,
    2,
  )
}

function handleCutImages(payload) {
  lastCutSummary.value = JSON.stringify(
    {
      source: payload.source,
      format: payload.format,
      imageCount: payload.images.length,
      images: payload.images.map((image) => ({
        label: image.label,
        width: image.width,
        height: image.height,
      })),
    },
    null,
    2,
  )
  lastSnapshot.value = formatSnapshot(payload.snapshot)
}

function formatSnapshot(snapshot) {
  if (!snapshot) {
    return '快照不可用。'
  }

  return JSON.stringify(
    {
      htmlLength: snapshot.html.length,
      styleConfig: snapshot.styleConfig,
      editorBoxConfig: snapshot.editorBoxConfig,
      previewConfig: snapshot.previewConfig,
      surfaceTheme: snapshot.surfaceTheme,
    },
    null,
    2,
  )
}
</script>

<template>
  <main class="demo-shell">
    <section class="demo-band">
      <div>
        <p class="demo-eyebrow">hd-text-editor</p>
        <h1>Plugin demo</h1>
        <p class="demo-copy">
          这个页面直接通过 npm 插件入口方式使用编辑器，用来演示 `v-model`、配置 props、ref
          方法和切图事件。
        </p>
      </div>

      <div class="demo-actions">
        <button type="button" @click="loadArticleDemo">Load article</button>
        <button type="button" @click="loadBannerDemo">Load banner</button>
        <button type="button" @click="applyPaperTheme">Paper theme</button>
        <button type="button" @click="applyNightTheme">Night theme</button>
        <button type="button" @click="focusEditor">Focus</button>
        <button type="button" @click="replaceWithApiContent">setHtml()</button>
        <button type="button" @click="captureSnapshot">Snapshot</button>
        <button type="button" @click="triggerCut">Cut PNG</button>
      </div>
    </section>

    <section class="demo-layout">
      <div class="demo-main">
        <HdTextEditor
          ref="editorRef"
          v-model="html"
          v-model:style-config="styleConfig"
          v-model:editor-box-config="editorBoxConfig"
          v-model:preview-config="previewConfig"
          v-model:surface-theme="surfaceTheme"
          :ui-style-map="demoUiStyleMap"
          @ready="handleReady"
          @text-change="handleTextChange"
          @selection-change="handleSelectionChange"
          @cut-images="handleCutImages"
        />
      </div>

      <aside class="demo-side">
        <section class="side-panel">
          <h2>Current HTML</h2>
          <textarea v-model="html" class="code-field" spellcheck="false" />
        </section>

        <section class="side-panel">
          <h2>Last event</h2>
          <pre class="state-block">{{ lastEvent }}</pre>
        </section>

        <section class="side-panel">
          <h2>Snapshot</h2>
          <pre class="state-block">{{ lastSnapshot }}</pre>
        </section>

        <section class="side-panel">
          <h2>Cut images</h2>
          <pre class="state-block">{{ lastCutSummary }}</pre>
        </section>
      </aside>
    </section>
  </main>
</template>

<style scoped>
.demo-shell {
  width: min(1480px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 32px 0 48px;
}

.demo-band {
  display: grid;
  gap: 18px;
  margin-bottom: 24px;
  padding: 24px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 24px 80px rgba(34, 49, 74, 0.1);
}

.demo-eyebrow {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #b46619;
}

h1,
h2 {
  margin: 0;
}

h1 {
  font-size: 36px;
  line-height: 1.08;
}

h2 {
  font-size: 16px;
  line-height: 1.2;
}

.demo-copy {
  margin: 12px 0 0;
  max-width: 760px;
  color: #556277;
}

.demo-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.demo-actions button {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid rgba(24, 33, 47, 0.12);
  border-radius: 12px;
  background: white;
  color: #18212f;
}

.demo-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 20px;
  align-items: start;
}

.demo-main {
  min-width: 0;
}

.demo-side {
  display: grid;
  gap: 16px;
}

.side-panel {
  display: grid;
  gap: 10px;
  padding: 16px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 12px 36px rgba(34, 49, 74, 0.08);
}

.code-field,
.state-block {
  width: 100%;
  min-height: 180px;
  margin: 0;
  padding: 12px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  border-radius: 14px;
  background: #fff;
  color: #18212f;
  font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.code-field {
  resize: vertical;
}

.state-block {
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 1120px) {
  .demo-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .demo-shell {
    width: min(100vw - 20px, 1480px);
    padding: 20px 0 28px;
  }

  .demo-band {
    padding: 18px;
    border-radius: 18px;
  }
}
</style>
