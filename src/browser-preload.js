const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('browserControls', {
  minimize: () => ipcRenderer.invoke('browser:minimize'),
  close: () => ipcRenderer.invoke('browser:close'),
  portal: () => ipcRenderer.invoke('browser:portal')
});
