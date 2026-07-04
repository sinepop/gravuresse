const fs = require('fs')
const path = require('path')
const { dialog } = require('electron')
const { sanitizeConversationImportPayload } = require('../security/sanitize')

function registerConversationIpc({
  ipcMain,
  store,
  getMainWindow,
  normalizeAssetLabel,
  inlineExportAssets,
  inlineExportConversations,
  remoteExportAssetCount,
  remoteExportConversationAssetCount,
  writeTextAtomic,
  maxProjectExportBytes
}) {
  ipcMain.handle('history:get', () => store.loadAll())
  ipcMain.handle('history:save', (_, records) => store.saveAllQueued(records))
  ipcMain.handle('conv:loadAll', () => store.loadAll())
  ipcMain.handle('conv:save', (_, id, data) => store.saveConversation(id, data))
  ipcMain.handle('conv:delete', (_, id) => store.deleteConversation(id))
  ipcMain.handle('conv:setActive', (_, id) => store.setActiveId(id))
  ipcMain.handle('conv:export', async (_, conversation = {}) => {
    const title = normalizeAssetLabel(conversation.title || 'conversation')
    const result = await dialog.showSaveDialog(getMainWindow(), {
      defaultPath: `${title}.gravuresse.json`,
      filters: [{ name: 'Gravuresse JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }

    const exportAssets = Array.isArray(conversation.assets) ? conversation.assets : []
    const media = await inlineExportAssets(exportAssets)
    const buildPayload = (assets, mediaMeta) => ({
      schemaVersion: 1,
      app: 'Gravuresse',
      exportedAt: new Date().toISOString(),
      media: mediaMeta,
      conversation: {
        title: conversation.title || '',
        messages: Array.isArray(conversation.messages) ? conversation.messages : [],
        assets
      }
    })
    let payload = buildPayload(media.assets, { inlined: media.inlined, skipped: media.skipped, fallback: false })
    let text = JSON.stringify(payload, null, 2)
    if (Buffer.byteLength(text, 'utf8') > maxProjectExportBytes && media.inlined > 0) {
      payload = buildPayload(exportAssets, { inlined: 0, skipped: remoteExportAssetCount(exportAssets), fallback: true })
      text = JSON.stringify(payload, null, 2)
    }
    if (Buffer.byteLength(text, 'utf8') > maxProjectExportBytes) {
      throw new Error('Conversation export is too large')
    }
    writeTextAtomic(text, path.resolve(result.filePath))
    return { canceled: false, filePath: path.resolve(result.filePath), media: payload.media }
  })
  ipcMain.handle('conv:exportProject', async (_, conversations = []) => {
    const result = await dialog.showSaveDialog(getMainWindow(), {
      defaultPath: `gravuresse-project-${new Date().toISOString().slice(0, 10)}.gravuresse.json`,
      filters: [{ name: 'Gravuresse JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { canceled: true }

    const sourceConversations = Array.isArray(conversations) ? conversations : []
    const media = await inlineExportConversations(sourceConversations)
    const buildPayload = (items, mediaMeta) => ({
      schemaVersion: 1,
      app: 'Gravuresse',
      kind: 'project',
      exportedAt: new Date().toISOString(),
      media: mediaMeta,
      conversations: items
    })
    let payload = buildPayload(media.conversations, { inlined: media.inlined, skipped: media.skipped, fallback: false })
    let text = JSON.stringify(payload, null, 2)
    if (Buffer.byteLength(text, 'utf8') > maxProjectExportBytes && media.inlined > 0) {
      payload = buildPayload(sourceConversations.map(conversation => ({
        title: conversation.title || '',
        messages: Array.isArray(conversation.messages) ? conversation.messages : [],
        assets: Array.isArray(conversation.assets) ? conversation.assets : []
      })), { inlined: 0, skipped: remoteExportConversationAssetCount(sourceConversations), fallback: true })
      text = JSON.stringify(payload, null, 2)
    }
    if (Buffer.byteLength(text, 'utf8') > maxProjectExportBytes) {
      throw new Error('Project export is too large')
    }
    writeTextAtomic(text, path.resolve(result.filePath))
    return { canceled: false, filePath: path.resolve(result.filePath), media: payload.media, count: sourceConversations.length }
  })
  ipcMain.handle('conv:import', async () => {
    const result = await dialog.showOpenDialog(getMainWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'Gravuresse JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePaths?.[0]) return { canceled: true }

    const filePath = path.resolve(result.filePaths[0])
    const stat = fs.statSync(filePath)
    if (stat.size > maxProjectExportBytes) {
      throw new Error('Conversation import is too large')
    }
    const data = sanitizeConversationImportPayload(JSON.parse(fs.readFileSync(filePath, 'utf8')))
    if (!data || (typeof data !== 'object' && !Array.isArray(data))) {
      throw new Error('Invalid Gravuresse import file')
    }
    return { canceled: false, data }
  })
}

module.exports = { registerConversationIpc }
