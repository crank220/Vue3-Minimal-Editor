<script setup>
import { computed } from 'vue'
import { styleState } from '../composables/useStyle'

const fontSizes = [16, 20, 24, 28, 32, 40, 48]
const alignments = [
  { label: 'Left', value: 'left' },
  { label: 'Center', value: 'center' },
  { label: 'Right', value: 'right' },
  { label: 'Justify', value: 'justify' },
]
const verticalAlignments = [
  { label: 'Top', value: 'flex-start' },
  { label: 'Center', value: 'center' },
  { label: 'Bottom', value: 'flex-end' },
]
const lineHeightPresets = [1, 1.2, 1.5, 1.8, 2, 2.4]

const backgroundValue = computed({
  get: () => (styleState.background === 'transparent' ? '#ffffff' : styleState.background),
  set: (value) => {
    styleState.background = value
  },
})

const lineHeightValue = computed({
  get: () => clampLineHeight(styleState.lineHeight),
  set: (value) => {
    styleState.lineHeight = clampLineHeight(value)
  },
})

const lineHeightLabel = computed(() => lineHeightValue.value.toFixed(1))

function clampLineHeight(value) {
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number)) {
    return 1.5
  }

  return Math.min(3, Math.max(1, Number(number.toFixed(1))))
}
</script>

<template>
  <div class="toolbar">
    <div class="toolbar-group">
      <button
        type="button"
        :class="{ active: styleState.bold }"
        @mousedown.prevent
        @click="styleState.bold = !styleState.bold"
      >
        B
      </button>
      <button
        type="button"
        :class="{ active: styleState.italic }"
        @mousedown.prevent
        @click="styleState.italic = !styleState.italic"
      >
        I
      </button>
      <button
        type="button"
        :class="{ active: styleState.underline }"
        @mousedown.prevent
        @click="styleState.underline = !styleState.underline"
      >
        U
      </button>
    </div>

    <div class="toolbar-group field-group">
      <label>
        Font size
        <select v-model.number="styleState.fontSize">
          <option v-for="size in fontSizes" :key="size" :value="size">{{ size }}</option>
        </select>
      </label>

      <label>
        Text color
        <input v-model="styleState.color" type="color" />
      </label>

      <label>
        Background
        <input v-model="backgroundValue" type="color" />
      </label>
    </div>

    <div class="toolbar-group field-group">
      <label>
        Stroke color
        <input v-model="styleState.strokeColor" type="color" />
      </label>

      <label>
        Stroke width
        <input v-model.number="styleState.strokeWidth" type="number" min="0" max="12" />
      </label>

      <label>
        Letter spacing
        <input v-model.number="styleState.letterSpacing" type="number" min="-10" max="30" />
      </label>

      <label class="line-height-control">
        <span class="field-heading">
          <span>Line height</span>
          <output>{{ lineHeightLabel }}</output>
        </span>
        <input
          v-model.number="lineHeightValue"
          class="line-height-slider"
          type="range"
          min="1"
          max="3"
          step="0.1"
        />
        <div class="line-height-presets">
          <button
            v-for="preset in lineHeightPresets"
            :key="preset"
            type="button"
            class="preset-button"
            :class="{ active: lineHeightValue === preset }"
            @mousedown.prevent
            @click="lineHeightValue = preset"
          >
            {{ preset.toFixed(1) }}
          </button>
        </div>
      </label>
    </div>

    <div class="toolbar-group field-group">
      <label>
        Align
        <select v-model="styleState.textAlign">
          <option v-for="item in alignments" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select>
      </label>

      <label>
        Vertical align
        <select v-model="styleState.verticalAlign">
          <option v-for="item in verticalAlignments" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select>
      </label>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.toolbar-group {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border-radius: 18px;
  background: rgba(13, 20, 33, 0.04);
}

.field-group {
  flex-wrap: wrap;
}

label {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: #556277;
}

output {
  font-variant-numeric: tabular-nums;
  color: #18212f;
}

button,
select,
input {
  border: 1px solid rgba(24, 33, 47, 0.12);
  border-radius: 12px;
  background: white;
  color: #18212f;
}

button {
  min-width: 42px;
  min-height: 42px;
  padding: 0 14px;
  font-weight: 700;
}

button.active {
  border-color: rgba(54, 107, 255, 0.55);
  background: rgba(54, 107, 255, 0.12);
  color: #234bce;
}

select,
input[type='number'] {
  min-height: 40px;
  padding: 0 12px;
}

input[type='color'] {
  width: 46px;
  height: 40px;
  padding: 4px;
}

.line-height-control {
  min-width: 220px;
}

.field-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.line-height-slider {
  width: 100%;
  min-height: auto;
  padding: 0;
}

.line-height-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.preset-button {
  min-width: 0;
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 600;
}

@media (max-width: 720px) {
  .toolbar {
    align-items: stretch;
  }

  .toolbar-group {
    width: 100%;
  }
}
</style>
