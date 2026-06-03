import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { cpSync, existsSync, mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

function copyElectronFiles() {
  const srcDir = resolve(__dirname, 'electron')
  const destDir = resolve(__dirname, 'dist/main')
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
  cpSync(resolve(srcDir, 'config.js'), resolve(destDir, 'config.js'))
  cpSync(resolve(srcDir, 'store.js'), resolve(destDir, 'store.js'))
  const apiSrc = resolve(srcDir, 'api')
  const apiDest = resolve(destDir, 'api')
  cpSync(apiSrc, apiDest, { recursive: true })
}

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin(),
      {
        name: 'copy-electron-files',
        closeBundle() { copyElectronFiles() }
      }
    ],
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/main.js')
      },
      outDir: 'dist/main'
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, 'electron/preload.js')
      },
      outDir: 'dist/preload'
    }
  },
  renderer: {
    root: '.',
    plugins: [react()],
    build: {
      rollupOptions: {
        input: 'index.html'
      },
      outDir: 'dist/renderer'
    }
  }
})
