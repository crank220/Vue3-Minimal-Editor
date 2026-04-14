<script setup>
// 根组件只负责挂载当前项目的核心编辑器，不额外承载业务逻辑。
import RichTextEditor from './components/RichTextEditor.vue'
</script>

<template>
  <!-- 项目主界面直接交给富文本编辑器组件渲染。 -->
  <RichTextEditor />
</template>
