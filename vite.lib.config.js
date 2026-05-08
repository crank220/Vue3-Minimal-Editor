import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 独立的库构建配置，避免 npm 插件产物和本地 demo 开发配置互相干扰。
export default defineConfig({
  plugins: [vue()],
  publicDir: false,
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.js'),
      name: 'HdTextEditor',
      fileName: (format) =>
        format === 'es' ? 'hd-text-editor.js' : `hd-text-editor.${format}.cjs`,
      cssFileName: 'hd-text-editor',
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        exports: 'named',
        globals: {
          vue: 'Vue',
        },
      },
    },
  },
})
