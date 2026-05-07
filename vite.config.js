import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({ mode }) => {
  const isLibraryBuild = mode === 'library'

  return {
    plugins: [vue()],
    build: isLibraryBuild
      ? {
          lib: {
            entry: resolve(__dirname, 'src/lib/index.js'),
            name: 'HdTextEditor',
            formats: ['es', 'umd'],
            cssFileName: 'style',
            fileName: (format) => (format === 'es' ? 'index.js' : 'index.umd.cjs'),
          },
          cssCodeSplit: false,
          copyPublicDir: false,
          rollupOptions: {
            external: ['vue'],
            output: {
              exports: 'named',
              globals: {
                vue: 'Vue',
              },
            },
          },
        }
      : undefined,
  }
})
