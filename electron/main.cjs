const { app, BrowserWindow, Menu, protocol, net, session, shell, ipcMain } = require('electron');
const path = require('node:path');
if (process.env.YIJIAN_TEST_DATA) app.setPath('userData', process.env.YIJIAN_TEST_DATA);
const { pathToFileURL } = require('node:url');
const { RapfiEngine } = require('./rapfi.cjs');
const engineDirectory = app.isPackaged ? path.join(process.resourcesPath, 'rapfi') : path.join(__dirname, '..', 'native', 'rapfi');
const engines = new Map();
const evaluators = new Map();
let roomService, roomServiceStarting;
function trusted(event) { return event.senderFrame?.url === 'yijian://app/index.html' && engines.has(event.sender.id); }
ipcMain.handle('rapfi:analyze', async (event, position) => {
  if (!trusted(event)) throw new Error('Untrusted sender');
  const engine = engines.get(event.sender.id);
  try {
    if (process.env.YIJIAN_TEST_DATA && process.env.YIJIAN_TEST_ENGINE_MS) position = { ...position, thinkMs: Number(process.env.YIJIAN_TEST_ENGINE_MS) };
    return { ok: true, ...await engine.analyze(position) };
  } catch (error) { return { ok: false, id: position?.id, cancelled: error.code === 'CANCELLED', error: error.message }; }
});
ipcMain.on('rapfi:cancel', (event, id) => { if (trusted(event) && Number.isSafeInteger(id)) engines.get(event.sender.id).cancel(id); });
ipcMain.handle('rapfi:evaluate', async (event, position) => {
  if (!trusted(event)) throw new Error('Untrusted sender');
  try { return { ok: true, ...await evaluators.get(event.sender.id).analyze({ ...position, thinkMs: 1500 }) }; }
  catch (error) { return { ok: false, id: position?.id, cancelled: error.code === 'CANCELLED', error: error.message }; }
});
ipcMain.on('rapfi:cancelEvaluation', (event, id) => { if (trusted(event) && Number.isSafeInteger(id)) evaluators.get(event.sender.id)?.cancel(id); });
ipcMain.handle('rooms:host', async event => {
  if (!trusted(event)) throw new Error('Untrusted sender');
  try {
    if (!roomService) {
      roomServiceStarting ||= import(pathToFileURL(path.join(__dirname, '..', 'server', 'index.mjs')).href)
        .then(({ createRoomServer }) => createRoomServer()).then(service => roomService = service).finally(() => roomServiceStarting = null);
      await roomServiceStarting;
    }
    const addresses = Object.values(require('node:os').networkInterfaces()).flat()
      .filter(n => n.family === 'IPv4' && !n.internal).map(n => `ws://${n.address}:${roomService.port}/room`);
    return { ok: true, local: `ws://127.0.0.1:${roomService.port}/room`, addresses: [...new Set(addresses)] };
  } catch (error) { return { ok: false, error: error.code === 'EADDRINUSE' ? '8787 端口已被使用；如果已开启房间服务，可以直接连接。' : '无法开启局域网服务：' + error.message }; }
});
protocol.registerSchemesAsPrivileged([{ scheme: 'yijian', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const allowedLinks = new Set(['https://www.renju.net/rifrules/', 'https://www.renju.net/openings/', 'https://github.com/mashiro222/FiveinaRow']);
function createWindow() {
  const window = new BrowserWindow({
    width: 1360, height: 920, minWidth: 960, minHeight: 720,
    title: '弈间 · Five in a Row', backgroundColor: '#f6f5f0',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 22, y: 20 },
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false }
  });
  const engine = new RapfiEngine(engineDirectory, { onProgress: data => { if (!window.isDestroyed()) window.webContents.send('rapfi:progress', data); } });
  const id = window.webContents.id;
  engines.set(id, engine);
  const evaluator = new RapfiEngine(engineDirectory, { threads: 2, hashMB: 128, onProgress: data => { if (!window.isDestroyed()) window.webContents.send('rapfi:evaluation', data); } });
  evaluators.set(id, evaluator);
  const closeEngines = () => { engine.close(); evaluator.close(); };
  window.on('closed', () => { closeEngines(); engines.delete(id); evaluators.delete(id); });
  window.webContents.on('render-process-gone', closeEngines);
  window.webContents.on('did-start-navigation', (_event, _url, _inPlace, isMainFrame) => { if (isMainFrame) closeEngines(); });
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
  const localNetworkPermission = (wc, permission, origin = '') =>
    ['local-network', 'local-network-access', 'loopback-network'].includes(permission)
    && wc?.getURL() === 'yijian://app/index.html'
    && (!origin || origin === 'yijian://app' || origin.startsWith('yijian://app/'));
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) => callback(localNetworkPermission(wc, permission, details.requestingUrl)));
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => localNetworkPermission(wc, permission, origin));
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

app.on('before-quit', () => { for (const engine of [...engines.values(), ...evaluators.values()]) engine.close(); roomService?.close(); });
