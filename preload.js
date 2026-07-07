const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getState: () => ipcRenderer.invoke('get-state'),
  fetchProjects: (apiToken, accountId) => ipcRenderer.invoke('fetch-projects', apiToken, accountId),
  playSound: (soundName) => ipcRenderer.invoke('play-sound', soundName),
  selectAudioFile: () => ipcRenderer.invoke('select-audio-file'),
  getStartupStatus: () => ipcRenderer.invoke('get-startup-status'),
  setStartupStatus: (enable) => ipcRenderer.invoke('set-startup-status', enable),
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowClose: () => ipcRenderer.send('window-close'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  onStateUpdate: (callback) => ipcRenderer.on('state-update', (event, state) => callback(state))
});
