function publicConfigPatch(input, defaultConfig) {
  const patch = {}
  if (input?.general && typeof input.general === 'object' && !Array.isArray(input.general)) {
    patch.general = {}
    for (const key of Object.keys(defaultConfig.general || {})) {
      if (Object.hasOwn(input.general, key)) patch.general[key] = input.general[key]
    }
  }
  if (input?.canvasLayout === 'grid' || input?.canvasLayout === 'free') patch.canvasLayout = input.canvasLayout
  return patch
}

function registerConfigIpc({ ipcMain, config }) {
  ipcMain.handle('config:get', () => config.redactApiKeys(config.load()))
  ipcMain.handle('config:save', async (_, cfg) => {
    const patch = publicConfigPatch(cfg, config.DEFAULT_CONFIG)
    await config.update(current => ({
      ...current,
      ...(patch.general ? { general: { ...current.general, ...patch.general } } : {}),
      ...(patch.canvasLayout ? { canvasLayout: patch.canvasLayout } : {})
    }))
  })
}

module.exports = { registerConfigIpc, _test: { publicConfigPatch } }
