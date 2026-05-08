// npm 插件入口：
// 1. 默认导出 Vue plugin，支持 app.use(HdTextEditor)；
// 2. 同时具名导出组件和默认标注工厂，便于按需引入。
import HdTextEditor from './components/RichTextEditor.vue'
import './style.css'

export {
  DEFAULT_EDITOR_BOX_STATE,
  DEFAULT_PREVIEW_STATE,
  DEFAULT_STYLE_STATE,
  FONT_FAMILY_OPTIONS,
  cloneTextEditorAnnotations,
  createTextEditorAnnotations,
  patchTextEditorAnnotations,
} from './composables/useStyle'
export { DEFAULT_EDITOR_HTML } from './constants/defaultContent'

export { HdTextEditor }

export default {
  install(app) {
    app.component('HdTextEditor', HdTextEditor)
  },
}
