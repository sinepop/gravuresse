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

  showSaveDialog: (opts) => ipcRenderer.invoke('dialog:save', opts),
  showOpenDialog: (opts) => ipcRenderer.invoke('dialog:open', opts),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  on: (channel, callback) => {
    const validChannels = ['window-maximized']
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => callback(...args))
    }
  }
})
