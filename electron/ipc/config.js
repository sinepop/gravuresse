function registerConfigIpc({ ipcMain, config }) {
  ipcMain.handle('config:get', () => config.redactApiKeys(config.load()))
  ipcMain.handle('config:save', async (_, cfg) => {
    const allowedKeys = Object.keys(config.DEFAULT_CONFIG)
    const filtered = {}
    for (const key of allowedKeys) {
      if (key in cfg) filtered[key] = cfg[key]
    }
    await config.save(config.mergeRedactedApiKeys(filtered, config.load()))
  })
}

module.exports = { registerConfigIpc }
