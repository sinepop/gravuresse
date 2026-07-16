const fs = require('fs')
const path = require('path')
const { dialog } = require('electron')

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeAssetSaveParams(params) {
  if (!isPlainObject(params)) throw new Error('Asset save request must be an object')
  const { url, label, type } = params
  if (typeof url !== 'string' || !url.trim()) throw new Error('Asset URL is required')
  if (type !== 'image' && type !== 'video') throw new Error('Asset type must be image or video')
  return { url, label, type }
}

function crossPlatformBasename(value, fallback = 'image') {
  const input = String(value || fallback)
  const normalized = input.replace(/\\+/g, '/')
  return path.posix.basename(normalized) || fallback
}

function safeImageLabel(value) {
  const name = crossPlatformBasename(value, 'Imported image')
  return name.replace(/\.(?:png|jpe?g|webp)$/i, '').slice(0, 120) || 'Imported image'
}

function publicImportFailure(name, error) {
  const raw = String(error?.message || '')
  const safeReason = /^(?:Asset data is too large|Unsupported asset data type|Asset MIME does not match content|Empty asset data)$/.test(raw)
    ? raw
    : 'Unable to read or import this image'
  return {
    name: crossPlatformBasename(name, 'image').slice(0, 160),
    reason: safeReason
  }
}

function registerAssetIpc({
  ipcMain,
  getMainWindow,
  saveDir,
  normalizeAssetLabel,
  writeAssetUrl,
  cacheAssetPreview,
  cacheAssetBytes,
  mediaCacheDir,
  validateAssetBytes,
  maxAssetBytes = 100 * 1024 * 1024,
  openExternalSafe
}) {
  ipcMain.handle('api:saveAsset', async (_, params) => {
    const { url, label, type } = normalizeAssetSaveParams(params)
    if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true })
    const filePath = path.join(saveDir, `${normalizeAssetLabel(label)}_${Date.now()}`)
    return await writeAssetUrl(url, filePath, type)
  })

  ipcMain.handle('api:getSaveDir', () => saveDir)

  ipcMain.handle('api:cacheAssetPreview', async (_, params) => {
    if (typeof cacheAssetPreview !== 'function') throw new Error('Asset preview cache is unavailable')
    return await cacheAssetPreview(params)
  })

  const importBytes = (name, declaredMime, bytes) => {
    const normalizedMime = String(declaredMime || '').toLowerCase() === 'image/jpg' ? 'image/jpeg' : declaredMime
    const cached = cacheAssetBytes(Buffer.from(bytes || []), 'image', normalizedMime, {
      cacheDir: mediaCacheDir,
      validateAssetBytes
    })
    return {
      url: cached.url,
      label: safeImageLabel(name),
      type: 'image',
      mime: cached.mime,
      size: cached.size
    }
  }

  ipcMain.handle('api:importLocalImages', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
    })
    if (result.canceled || !result.filePaths?.length) return { canceled: true, imported: [], rejected: [] }
    const imported = []
    const rejected = []
    for (const filePath of result.filePaths) {
      const name = path.basename(filePath)
      try {
        const stat = fs.statSync(path.resolve(filePath))
        if (!stat.isFile()) throw new Error('Unsupported asset data type')
        if (stat.size > maxAssetBytes) throw new Error('Asset data is too large')
        const bytes = fs.readFileSync(path.resolve(filePath))
        imported.push(importBytes(name, '', bytes))
      } catch (error) {
        rejected.push(publicImportFailure(name, error))
      }
    }
    return { canceled: false, imported, rejected }
  })

  ipcMain.handle('api:importImageBytes', async (_, params = {}) => {
    const name = crossPlatformBasename(params.name, 'Pasted image')
    try {
      return { canceled: false, imported: [importBytes(name, params.mime, params.bytes)], rejected: [] }
    } catch (error) {
      return { canceled: false, imported: [], rejected: [publicImportFailure(name, error)] }
    }
  })

  ipcMain.handle('api:saveAssetWithDialog', async (_, params) => {
    const { url, label, type } = normalizeAssetSaveParams(params)
    const extensions = type === 'video' ? ['mp4'] : ['png', 'jpg', 'webp']
    const ext = extensions[0]
    const result = await dialog.showSaveDialog(getMainWindow(), {
      defaultPath: `${normalizeAssetLabel(label)}.${ext}`,
      filters: [{ name: type === 'video' ? 'MP4' : 'Images', extensions }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    const resolved = await writeAssetUrl(url, path.resolve(result.filePath), type)
    return { canceled: false, filePath: resolved }
  })

  ipcMain.handle('shell:open-external', (_, url) => openExternalSafe(url))
}

module.exports = { registerAssetIpc, _test: { normalizeAssetSaveParams, safeImageLabel, publicImportFailure } }
