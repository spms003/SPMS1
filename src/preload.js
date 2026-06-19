const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('schoolPortal', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateConfig: (patch) => ipcRenderer.invoke('config:update', patch),
  publishAnnouncement: (patch, alert) => ipcRenderer.invoke('announcement:publish', patch, alert),
  syncNow: () => ipcRenderer.invoke('sync:now'),
  loginAdmin: (password) => ipcRenderer.invoke('admin:login', password),
  launchShortcut: (shortcut) => ipcRenderer.invoke('shortcut:launch', shortcut),
  toggleFullScreen: () => ipcRenderer.invoke('window:toggleFullScreen'),
  pickIcon: () => ipcRenderer.invoke('dialog:pickIcon'),
  pickProgram: () => ipcRenderer.invoke('dialog:pickProgram'),
  pickUpdateInstaller: () => ipcRenderer.invoke('dialog:pickUpdateInstaller'),
  searchNeisSchool: (schoolName) => ipcRenderer.invoke('neis:searchSchool', schoolName),
  getNeisMeal: (date) => ipcRenderer.invoke('neis:getMeal', date),
  publishLanUpdate: (info) => ipcRenderer.invoke('update:publishLan', info),
  downloadUpdate: (update) => ipcRenderer.invoke('update:download', update),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  acknowledgeAlert: () => ipcRenderer.invoke('alert:ack'),
  boostAlertVolume: () => ipcRenderer.invoke('alert:boostVolume'),
  restoreAlertVolume: () => ipcRenderer.invoke('alert:restoreVolume'),
  getDevices: () => ipcRenderer.invoke('devices:get'),
  requestRemoteSupport: (deviceId) => ipcRenderer.invoke('remote-support:request', deviceId),
  checkAutoUpdate: () => ipcRenderer.invoke('update:autoCheck'),
  deferAutoUpdate: () => ipcRenderer.invoke('update:defer'),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  openUpdateDownload: (url) => ipcRenderer.invoke('update:openDownload', url),
  onConfigChanged: (callback) => {
    ipcRenderer.on('config:changed', (_event, payload) => callback(payload));
  },
  onUpdateEvent: (callback) => {
    ipcRenderer.on('update:event', (_event, payload) => callback(payload));
  },
  onDevicesChanged: (callback) => {
    ipcRenderer.on('devices:changed', (_event, payload) => callback(payload));
  },
  onRemoteSupportResponse: (callback) => {
    ipcRenderer.on('remote-support:response', (_event, payload) => callback(payload));
  }
});
