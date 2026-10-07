const { app, BrowserWindow, Menu, protocol, net, session, shell } = require('electron');
const path = require('node:path');
if (process.env.YIJIAN_TEST_DATA) app.setPath('userData', process.env.YIJIAN_TEST_DATA);
const { pathToFileURL } = require('node:url');
protocol.registerSchemesAsPrivileged([{ scheme: 'yijian', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const allowedLinks = new Set(['https://www.renju.net/rifrules/', 'https://www.renju.net/openings/', 'https://github.com/mashiro222/FiveinaRow']);
function createWindow() {
  const window = new BrowserWindow({
    width: 1360, height: 920, minWidth: 960, minHeight: 720,
    title: '弈间 · Five in a Row', backgroundColor: '#f6f5f0',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 22, y: 20 },
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  window.webContents.setWindowOpenHandler(({url}) => { if (allowedLinks.has(url)) shell.openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (url !== 'yijian://app/index.html') event.preventDefault(); });
  window.loadURL('yijian://app/index.html');
}
app.whenReady().then(() => {
  protocol.handle('yijian', request => {
    const url = new URL(request.url);
    if (url.hostname !== 'app') return new Response('Forbidden', {status:403});
    const root = app.getAppPath();
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep)) return new Response('Forbidden', {status:403});
    return net.fetch(pathToFileURL(file).toString());
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _p, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  const template = [
    ...(process.platform === 'darwin' ? [{ label: '弈间', submenu: [{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{type:'separator'},{role:'quit'}] }] : []),
    {label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
    {label:'显示',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{type:'separator'},{role:'togglefullscreen'}]},
    {label:'窗口',submenu:[{role:'minimize'},{role:'close'}]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
