const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  load: () => ipcRenderer.invoke('data:load'),
  save: data => ipcRenderer.invoke('data:save', data),
  flush: data => ipcRenderer.sendSync('data:flush', data),
  window: action => ipcRenderer.send('window:action', action),
  setTheme: theme => ipcRenderer.send('appearance:theme', theme),
  exportData: data => ipcRenderer.invoke('data:export', data),
  importData: () => ipcRenderer.invoke('data:import'),
  showDataFolder: () => ipcRenderer.invoke('data:folder'),
});
