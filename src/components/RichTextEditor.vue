<script setup>
import { computed, nextTick, ref } from 'vue'
import ToolbarPanel from './ToolbarPanel.vue'
import { saveRange, restoreRange, getRange } from '../composables/useSelection'
import { styleState, styleToCss } from '../composables/useStyle'
import { normalize } from '../utils/normalize'

const editorRef = ref(null)

const editorStyle = computed(() => ({
  textAlign: styleState.textAlign,
  alignItems: styleState.verticalAlign,
  lineHeight: styleState.lineHeight,
}))

function saveSelection() {
  saveRange(editorRef.value)
}

function applyStyleToSelection() {
  restoreRange(editorRef.value)

  const range = getRange()
  if (!range || range.collapsed) {
    editorRef.value?.focus()
    return
  }

  const span = document.createElement('span')
  Object.assign(span.style, styleToCss(styleState))

  try {
    range.surroundContents(span)
  } catch {
    const content = range.extractContents()
    span.appendChild(content)
    range.insertNode(span)
  }

  nextTick(() => {
    if (editorRef.value) {
      normalize(editorRef.value)
      saveRange(editorRef.value)
    }
  })
}

function onInput() {
  nextTick(() => {
    if (editorRef.value) {
      normalize(editorRef.value)
      saveRange(editorRef.value)
    }
  })
}
</script>

<template>
  <main class="editor-shell">
    <section class="intro-card">
      <p class="eyebrow">Vue3 Minimal Editor</p>
      <h1>contenteditable + Range + normalize</h1>
      <p class="intro-copy">
        This follows the shared architecture closely: keep the editable layer limited to
        <code>span</code> and <code>br</code>, then use selection restore, style state, and
        a normalize pass to keep the DOM predictable.
      </p>
    </section>

    <section class="workspace-card">
      <ToolbarPanel @apply="applyStyleToSelection" />

      <div class="editor-stage" :style="editorStyle">
        <div
          ref="editorRef"
          class="editor"
          contenteditable="true"
          spellcheck="false"
          @mouseup="saveSelection"
          @keyup="saveSelection"
          @focus="saveSelection"
          @input="onInput"
        >
          Select this text first, then use the toolbar above to apply font size, colors,
          stroke, letter spacing, and line height.
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.editor-shell {
  width: min(1120px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 48px 0 56px;
}

.intro-card,
.workspace-card {
  border: 1px solid rgba(24, 33, 47, 0.1);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(18px);
  box-shadow: 0 24px 80px rgba(34, 49, 74, 0.12);
}

.intro-card {
  padding: 32px;
}

.eyebrow {
  margin: 0 0 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #b46619;
}

h1 {
  margin: 0;
  font-size: clamp(32px, 5vw, 56px);
  line-height: 1.02;
  letter-spacing: -0.04em;
}

.intro-copy {
  max-width: 720px;
  margin: 16px 0 0;
  font-size: 16px;
  color: #556277;
}

code {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(13, 20, 33, 0.06);
}

.workspace-card {
  margin-top: 18px;
  padding: 20px;
}

.editor-stage {
  min-height: 420px;
  margin-top: 18px;
  padding: 24px;
  border-radius: 24px;
  border: 1px dashed rgba(30, 41, 59, 0.18);
  background:
    linear-gradient(rgba(229, 236, 246, 0.82), rgba(229, 236, 246, 0.82)),
    linear-gradient(90deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.95));
  display: flex;
}

.editor {
  width: 100%;
  min-height: 320px;
  padding: 20px 24px;
  border-radius: 20px;
  border: 1px solid rgba(24, 33, 47, 0.08);
  background: white;
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 24px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.editor:focus {
  border-color: rgba(54, 107, 255, 0.35);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    0 0 0 4px rgba(54, 107, 255, 0.12);
}

@media (max-width: 720px) {
  .editor-shell {
    width: min(100vw - 20px, 1120px);
    padding: 20px 0 28px;
  }

  .intro-card,
  .workspace-card {
    border-radius: 22px;
  }

  .intro-card {
    padding: 24px 20px;
  }

  .workspace-card {
    padding: 14px;
  }

  .editor-stage,
  .editor {
    border-radius: 18px;
  }

  .editor {
    min-height: 260px;
    padding: 18px;
    font-size: 20px;
  }
}
</style>
