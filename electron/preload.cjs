const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('rapfi', {
  analyze: position => ipcRenderer.invoke('rapfi:analyze', position),
  cancel: id => ipcRenderer.send('rapfi:cancel', id),
  onProgress: callback => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('rapfi:progress', handler);
    return () => ipcRenderer.removeListener('rapfi:progress', handler);
  }
});
