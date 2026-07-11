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
  exportConversation: (conversation) => ipcRenderer.invoke('conv:export', conversation),
  exportProject: (conversations) => ipcRenderer.invoke('conv:exportProject', conversations),
  importConversation: () => ipcRenderer.invoke('conv:import'),

  chat: (messages, provider) => ipcRenderer.invoke('api:chat', messages, provider),
  generateImage: (params) => ipcRenderer.invoke('api:image', params),
  generateVideo: (params) => ipcRenderer.invoke('api:video', params),
  pollVideoTask: (taskId, provider) => ipcRenderer.invoke('api:video:poll', taskId, provider),
  fetchModels: (provider) => ipcRenderer.invoke('api:models', provider),

  providerAPI: {
    call: (params) => ipcRenderer.invoke('provider:call', params),
    list: (action) => ipcRenderer.invoke('provider:list', action),
    test: (params) => ipcRenderer.invoke('provider:test', params),
    fetchModels: (params) => ipcRenderer.invoke('provider:fetchModels', params),
    testConnection: (params) => ipcRenderer.invoke('provider:testConnection', params)
  },
  providerConnection: {
    list: () => ipcRenderer.invoke('providerConnection:list'),
    save: (params) => ipcRenderer.invoke('providerConnection:save', params),
    remove: (params) => ipcRenderer.invoke('providerConnection:remove', params)
  },
  providerAuth: {
    begin: (params) => ipcRenderer.invoke('providerAuth:begin', params),
    status: (params) => ipcRenderer.invoke('providerAuth:status', params),
    cancel: (params) => ipcRenderer.invoke('providerAuth:cancel', params),
    disconnect: (params) => ipcRenderer.invoke('providerAuth:disconnect', params)
  },
  providerModels: {
    refresh: (params) => ipcRenderer.invoke('providerModels:refresh', params)
  },
  providerValidation: {
    run: (params) => ipcRenderer.invoke('providerValidation:run', params)
  },
  providerDefaults: {
    save: (params) => ipcRenderer.invoke('providerDefaults:save', params)
  },

  saveAssetToDisk: (params) => ipcRenderer.invoke('api:saveAsset', params),
  saveAssetWithDialog: (params) => ipcRenderer.invoke('api:saveAssetWithDialog', params),
  cacheAssetPreview: (params) => ipcRenderer.invoke('api:cacheAssetPreview', params),
  importLocalImages: () => ipcRenderer.invoke('api:importLocalImages'),
  importImageBytes: (params) => ipcRenderer.invoke('api:importImageBytes', params),
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
