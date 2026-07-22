import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { cpSync, existsSync, mkdirSync, readdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

function collectMainProcessInputs() {
  const electronDir = resolve(__dirname, 'electron')
  const inputs = { main: resolve(electronDir, 'main-entry.ts') }

  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      const absolutePath = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        visit(absolutePath, relativePath)
        continue
      }
      if (!/\.(?:js|ts)$/.test(entry.name)) continue
      if (['main.js', 'preload.js', 'main-entry.ts', 'preload-entry.ts'].includes(relativePath)) continue
      const outputName = relativePath.replace(/\.(?:js|ts)$/, '')
      if (inputs[outputName]) throw new Error(`Duplicate Electron build input: ${outputName}`)
      inputs[outputName] = absolutePath
    }
  }

  visit(electronDir)
  return inputs
}

function copyBuildAssets() {
  const iconSrc = resolve(__dirname, 'build/icon.png')
  if (!existsSync(iconSrc)) return
  const destDir = resolve(__dirname, 'dist/build')
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
  cpSync(iconSrc, resolve(destDir, 'icon.png'))
}

function copySharedRuntimeFiles() {
  const destDir = resolve(__dirname, 'dist/shared')
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
  cpSync(resolve(__dirname, 'shared/modelCapabilities.cjs'), resolve(destDir, 'modelCapabilities.cjs'))
}

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin(),
      {
        name: 'copy-electron-files',
        closeBundle() {
          copyBuildAssets()
          copySharedRuntimeFiles()
        }
      }
    ],
    build: {
      rollupOptions: {
        input: collectMainProcessInputs(),
        output: { entryFileNames: '[name].js' }
      },
      outDir: 'dist/main'
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'electron/preload-entry.ts'),
        output: { entryFileNames: 'preload.js' }
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
