import RichTextEditor from '../components/RichTextEditor.vue'

export {
  FONT_FAMILY_OPTIONS,
  DEFAULT_EDITOR_BOX_STATE,
  DEFAULT_PREVIEW_STATE,
  DEFAULT_STYLE_STATE,
  DEFAULT_SURFACE_THEME,
  createEditorBoxConfig,
  createPreviewConfig,
  createStyleConfig,
  createSurfaceTheme,
  normalizeEditorBoxConfig,
  normalizePreviewConfig,
  normalizeStyleConfig,
  resolveFontFamily,
  styleToCss,
  toPlainState,
} from '../composables/useStyle'

export const HdTextEditor = RichTextEditor

export const HdTextEditorPlugin = {
  install(app) {
    app.component('HdTextEditor', RichTextEditor)
  },
}

export default HdTextEditorPlugin
