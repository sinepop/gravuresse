import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname, relative } from 'path'
import { fileURLToPath } from 'url'
import { cpSync, existsSync, mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

function copyElectronRuntimeFiles() {
  const srcDir = resolve(__dirname, 'electron')
  const destDir = resolve(__dirname, 'dist/main')
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
  cpSync(srcDir, destDir, {
    recursive: true,
    filter: (src) => {
      const rel = relative(srcDir, src).replace(/\\/g, '/')
      return rel !== 'main.js' && rel !== 'preload.js'
    }
  })
}

function copyBuildAssets() {
  const iconSrc = resolve(__dirname, 'build/icon.png')
  if (!existsSync(iconSrc)) return
  const destDir = resolve(__dirname, 'dist/build')
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
  cpSync(iconSrc, resolve(destDir, 'icon.png'))
}

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin(),
      {
        name: 'copy-electron-files',
        closeBundle() {
          copyElectronRuntimeFiles()
          copyBuildAssets()
        }
      }
    ],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/main.js')
      },
      outDir: 'dist/main'
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload.js')
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
