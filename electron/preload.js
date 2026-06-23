const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),

  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),

  getHistory: () => ipcRenderer.invoke('history:get'),
  saveHistory: (records) => ipcRenderer.invoke('history:save', records),

  loadConversations: () => ipcRenderer.invoke('conv:loadAll'),
  saveConversation: (id, data) => ipcRenderer.invoke('conv:save', id, data),
  deleteConversation: (id) => ipcRenderer.invoke('conv:delete', id),
  setActiveConversation: (id) => ipcRenderer.invoke('conv:setActive', id),

  chat: (messages, provider) => ipcRenderer.invoke('api:chat', messages, provider),
  generateImage: (params) => ipcRenderer.invoke('api:image', params),
  generateVideo: (params) => ipcRenderer.invoke('api:video', params),
  pollVideoTask: (taskId, provider) => ipcRenderer.invoke('api:video:poll', taskId, provider),
  fetchModels: (provider) => ipcRenderer.invoke('api:models', provider),

  providerAPI: {
    call: (params) => ipcRenderer.invoke('provider:call', params),
    list: (action) => ipcRenderer.invoke('provider:list', action),
    test: (params) => ipcRenderer.invoke('provider:test', params)
  },

  saveAssetToDisk: (params) => ipcRenderer.invoke('api:saveAsset', params),
  saveAssetWithDialog: (params) => ipcRenderer.invoke('api:saveAssetWithDialog', params),
  getSaveDir: () => ipcRenderer.invoke('api:getSaveDir'),

  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  on: (channel, callback) => {
    const validChannels = ['window-maximized']
    if (!validChannels.includes(channel)) return undefined
    const handler = (_, ...args) => callback(...args)
    ipcRenderer.on(channel, handler)
    // Return an unsubscribe fn so listeners can clean up reliably without
    // having to pass the ipc listener back to off().
    return () => ipcRenderer.removeListener(channel, handler)
  },

  off: (channel, handler) => {
    const validChannels = ['window-maximized']
    if (validChannels.includes(channel) && handler) {
      ipcRenderer.removeListener(channel, handler)
    }
  }
})
