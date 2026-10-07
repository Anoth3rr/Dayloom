const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  account: {
    session: () => ipcRenderer.invoke('account:session'),
    call: request => ipcRenderer.invoke('account:call', request),
    loadProfile: key => ipcRenderer.invoke('account:load', key),
    saveProfile: (key, envelope) => ipcRenderer.invoke('account:save', key, envelope),
    flushProfile: (key, envelope) => ipcRenderer.sendSync('account:flush', key, envelope),
  },
  load: () => ipcRenderer.invoke('data:load'),
  save: data => ipcRenderer.invoke('data:save', data),
  flush: data => ipcRenderer.sendSync('data:flush', data),
  window: action => ipcRenderer.send('window:action', action),
  setTheme: theme => ipcRenderer.send('appearance:theme', theme),
  exportData: data => ipcRenderer.invoke('data:export', data),
  importData: () => ipcRenderer.invoke('data:import'),
  showDataFolder: () => ipcRenderer.invoke('data:folder'),
});
