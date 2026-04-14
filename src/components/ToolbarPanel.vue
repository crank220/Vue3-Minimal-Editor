<script setup>
// 工具栏组件。
// 负责维护所有样式输入入口，并把最终配置写入共享状态。
// 具体如何把这些状态应用到选区，由 RichTextEditor 负责。
import { computed } from 'vue'
import { FONT_FAMILY_OPTIONS, editorBoxState, previewState, styleState } from '../composables/useStyle'

// 将切图动作抛给父组件，由父组件调用预览区的导出逻辑。
const emit = defineEmits(['cut-images'])

// 基础文字控制选项。
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

// 描边、预览格式和动画相关配置选项。
const strokePositions = [
  { label: 'Inside', value: 'inside' },
  { label: 'Center', value: 'center' },
  { label: 'Outside', value: 'outside' },
]
const previewFormats = [
  { label: 'Multiline', value: 'multiline' },
  { label: 'Single line', value: 'singleline' },
]
const pageTransitionDirections = [
  { label: 'Static', value: 'static' },
  { label: 'Move left', value: 'left' },
  { label: 'Move right', value: 'right' },
  { label: 'Move up', value: 'up' },
  { label: 'Move down', value: 'down' },
]
const pageTransitionOptions = [
  { label: '100ms', value: 100 },
  { label: '200ms', value: 200 },
  { label: '300ms', value: 300 },
  { label: '400ms', value: 400 },
  { label: '500ms', value: 500 },
  { label: '700ms', value: 700 },
  { label: '1s', value: 1000 },
  { label: '2s', value: 2000 },
]
const singleLineModes = [
  { label: 'Static', value: 'static' },
  { label: 'Move left', value: 'left' },
  { label: 'Move right', value: 'right' },
]
const singleLineSpeedOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9]
const lineHeightPresets = [1, 1.2, 1.5, 1.8, 2, 2.4]

// 背景色在 UI 中总是使用颜色选择器展示。
// 当实际值是 transparent 时，这里临时回显为白色，避免原生颜色框无法显示“透明”。
const backgroundValue = computed({
  get: () => (styleState.background === 'transparent' ? '#ffffff' : styleState.background),
  set: (value) => {
    styleState.background = value
  },
})

// 行高会被滑杆与预设按钮共同修改，因此用计算属性统一做约束。
const lineHeightValue = computed({
  get: () => clampLineHeight(styleState.lineHeight),
  set: (value) => {
    styleState.lineHeight = clampLineHeight(value)
  },
})

// 单独格式化当前行高显示值，避免模板内重复处理小数。
const lineHeightLabel = computed(() => lineHeightValue.value.toFixed(1))

function clampLineHeight(value) {
  // 行高统一限制在 1.0 - 3.0 范围内，并保留 1 位小数。
  const number = Number.parseFloat(value)
  if (!Number.isFinite(number)) {
    return 1.5
  }

  return Math.min(3, Math.max(1, Number(number.toFixed(1))))
}
</script>

<template>
  <!-- 工具栏按“文字样式 / 编辑区尺寸 / 预览配置”分组展示。 -->
  <div class="toolbar">
    <!-- 常用强调样式按钮。 -->
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

    <!-- 字体与字号配置。 -->
    <div class="toolbar-group field-group">
      <label>
        Font family
        <select v-model="styleState.fontFamily">
          <option v-for="item in FONT_FAMILY_OPTIONS" :key="item.label" :value="item.value">
            {{ item.label }}
          </option>
        </select>
      </label>

      <label>
        Font size
        <select v-model.number="styleState.fontSize">
          <option v-for="size in fontSizes" :key="size" :value="size">{{ size }}</option>
        </select>
      </label>
    </div>

    <!-- 文本颜色与背景色配置。 -->
    <div class="toolbar-group field-group">
      <label>
        Text color
        <input v-model="styleState.color" type="color" />
      </label>

      <label>
        Background
        <input v-model="backgroundValue" type="color" />
      </label>
    </div>

    <!-- 描边颜色、粗细与位置配置。 -->
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
        Stroke align
        <select v-model="styleState.strokePosition">
          <option v-for="item in strokePositions" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select>
      </label>
    </div>

    <!-- 字间距与行高配置。 -->
    <div class="toolbar-group field-group">
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

    <!-- 水平对齐与垂直对齐配置。 -->
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

    <!-- 编辑区尺寸与四向内边距配置。 -->
    <div class="toolbar-group field-group">
      <label>
        Editor width
        <input v-model.number="editorBoxState.width" type="number" min="120" step="1" />
      </label>

      <label>
        Editor height
        <input v-model.number="editorBoxState.height" type="number" min="120" step="1" />
      </label>

      <label>
        Padding top
        <input v-model.number="editorBoxState.paddingTop" type="number" min="0" step="1" />
      </label>

      <label>
        Padding right
        <input v-model.number="editorBoxState.paddingRight" type="number" min="0" step="1" />
      </label>

      <label>
        Padding bottom
        <input v-model.number="editorBoxState.paddingBottom" type="number" min="0" step="1" />
      </label>

      <label>
        Padding left
        <input v-model.number="editorBoxState.paddingLeft" type="number" min="0" step="1" />
      </label>
    </div>

    <!-- 预览模式、动画参数和切图参数配置。 -->
    <div class="toolbar-group field-group">
      <label>
        Preview format
        <select v-model="previewState.format">
          <option v-for="item in previewFormats" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select>
      </label>

      <template v-if="previewState.format === 'multiline'">
        <label>
          Page motion
          <select v-model="previewState.pageTransitionDirection">
            <option
              v-for="item in pageTransitionDirections"
              :key="item.value"
              :value="item.value"
            >
              {{ item.label }}
            </option>
          </select>
        </label>

        <label>
          Page transition
          <select v-model.number="previewState.pageTransitionMs">
            <option v-for="item in pageTransitionOptions" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </label>

        <label>
          Page stay (s)
          <input
            v-model.number="previewState.pageStaySeconds"
            type="number"
            min="1"
            max="9999"
            step="1"
          />
        </label>
      </template>

      <template v-else>
        <label>
          Cut image width
          <input
            v-model.number="previewState.cutImageWidth"
            type="number"
            min="1"
            max="65536"
            step="1"
          />
        </label>

        <label>
          Single line mode
          <select v-model="previewState.singleLineMode">
            <option v-for="item in singleLineModes" :key="item.value" :value="item.value">
              {{ item.label }}
            </option>
          </select>
        </label>

        <label>
          Speed
          <select v-model.number="previewState.singleLineSpeed">
            <option v-for="speed in singleLineSpeedOptions" :key="speed" :value="speed">
              {{ speed }}
            </option>
          </select>
        </label>

        <label class="toggle-label">
          Loop seamlessly
          <input v-model="previewState.singleLineSeamless" type="checkbox" />
        </label>
      </template>

      <button type="button" @mousedown.prevent @click="emit('cut-images')">Cut PNG</button>
    </div>
  </div>
</template>

<style scoped>
/* 工具栏主体允许自动换行，避免配置项过多时横向溢出。 */
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

/* 每个工具分组都有独立容器，便于视觉分区。 */
.toolbar-group {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px;
  border-radius: 18px;
  background: rgba(13, 20, 33, 0.04);
}

/* 表单型分组允许内部项目自动换行。 */
.field-group {
  flex-wrap: wrap;
}

/* label 采用标题在上、控件在下的纵向布局。 */
label {
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: #556277;
}

/* 数值输出使用等宽数字，减少跳动感。 */
output {
  font-variant-numeric: tabular-nums;
  color: #18212f;
}

/* 为按钮、下拉框和输入框统一基础视觉风格。 */
button,
select,
input {
  border: 1px solid rgba(24, 33, 47, 0.12);
  border-radius: 12px;
  background: white;
  color: #18212f;
}

/* 普通按钮使用更大的点击面积。 */
button {
  min-width: 42px;
  min-height: 42px;
  padding: 0 14px;
  font-weight: 700;
}

/* 激活态用于展示当前已启用的布尔样式。 */
button.active {
  border-color: rgba(54, 107, 255, 0.55);
  background: rgba(54, 107, 255, 0.12);
  color: #234bce;
}

/* 下拉框和数字输入统一高度，便于对齐。 */
select,
input[type='number'] {
  min-height: 40px;
  padding: 0 12px;
}

/* 颜色输入框使用固定小尺寸。 */
input[type='color'] {
  width: 46px;
  height: 40px;
  padding: 4px;
}

/* 复选框去掉默认 margin，方便与文字对齐。 */
input[type='checkbox'] {
  width: 18px;
  height: 18px;
  margin: 0;
}

/* 行高控件需要容纳滑杆和预设按钮，因此给更宽的最小宽度。 */
.line-height-control {
  min-width: 220px;
}

/* 复选框型 label 在垂直方向居中。 */
.toggle-label {
  align-content: center;
}

/* 行高标题行同时展示字段名与当前数值。 */
.field-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

/* 滑杆宽度跟随父容器。 */
.line-height-slider {
  width: 100%;
  min-height: auto;
  padding: 0;
}

/* 行高预设按钮允许换行展示。 */
.line-height-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* 预设按钮比普通按钮更紧凑。 */
.preset-button {
  min-width: 0;
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 600;
}

@media (max-width: 720px) {
  /* 移动端下每个工具组单独占一行，提升可读性。 */
  .toolbar {
    align-items: stretch;
  }

  .toolbar-group {
    width: 100%;
  }
}
</style>
