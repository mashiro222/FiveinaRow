const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('rapfi', {
  analyze: position => ipcRenderer.invoke('rapfi:analyze', position),
  cancel: id => ipcRenderer.send('rapfi:cancel', id),
  evaluate: position => ipcRenderer.invoke('rapfi:evaluate', position),
  cancelEvaluation: id => ipcRenderer.send('rapfi:cancelEvaluation', id),
  onEvaluation: callback => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('rapfi:evaluation', handler);
    return () => ipcRenderer.removeListener('rapfi:evaluation', handler);
  },
  onProgress: callback => {
    const handler = (_event, progress) => callback(progress);
    ipcRenderer.on('rapfi:progress', handler);
    return () => ipcRenderer.removeListener('rapfi:progress', handler);
  }
});
contextBridge.exposeInMainWorld('roomsHost', { start: () => ipcRenderer.invoke('rooms:host') });
