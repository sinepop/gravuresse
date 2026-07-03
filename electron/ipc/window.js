function registerWindowIpc({ ipcMain, getMainWindow }) {
  ipcMain.on('window-minimize', () => getMainWindow()?.minimize())
  ipcMain.on('window-maximize', () => {
    const mainWindow = getMainWindow()
    if (!mainWindow) return
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  })
  ipcMain.on('window-close', () => getMainWindow()?.close())
  ipcMain.handle('window-is-maximized', () => getMainWindow()?.isMaximized() ?? false)
}

module.exports = { registerWindowIpc }
