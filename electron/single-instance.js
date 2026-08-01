function acquireSingleInstanceLock(app, getMainWindow) {
  const acquired = app.requestSingleInstanceLock()
  if (!acquired) {
    app.quit()
    return false
  }

  app.on('second-instance', () => {
    const window = getMainWindow()
    if (!window || (typeof window.isDestroyed === 'function' && window.isDestroyed())) return
    if (typeof window.isMinimized === 'function' && window.isMinimized()) window.restore()
    window.show()
    window.focus()
  })
  return true
}

module.exports = { acquireSingleInstanceLock }
