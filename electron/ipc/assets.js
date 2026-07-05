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

function registerAssetIpc({
  ipcMain,
  getMainWindow,
  saveDir,
  normalizeAssetLabel,
  writeAssetUrl,
  cacheAssetPreview,
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

module.exports = { registerAssetIpc, _test: { normalizeAssetSaveParams } }
