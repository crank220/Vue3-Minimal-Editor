<script setup>
import { styleState } from '../composables/useStyle'

defineEmits(['apply'])

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
</script>

<template>
  <div class="toolbar">
    <div class="toolbar-group">
      <button :class="{ active: styleState.bold }" @click="styleState.bold = !styleState.bold">
        B
      </button>
      <button
        :class="{ active: styleState.italic }"
        @click="styleState.italic = !styleState.italic"
      >
        I
      </button>
      <button
        :class="{ active: styleState.underline }"
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
        <input v-model="styleState.background" type="color" />
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

      <label>
        Line height
        <input
          v-model.number="styleState.lineHeight"
          type="number"
          min="1"
          max="3"
          step="0.1"
        />
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

    <button class="apply-button" @click="$emit('apply')">Apply style</button>
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

.apply-button {
  min-width: 108px;
  background: linear-gradient(135deg, #2d62ff, #5e8bff);
  border-color: transparent;
  color: white;
}

@media (max-width: 720px) {
  .toolbar {
    align-items: stretch;
  }

  .toolbar-group,
  .apply-button {
    width: 100%;
  }

  .apply-button {
    min-height: 44px;
  }
}
</style>
