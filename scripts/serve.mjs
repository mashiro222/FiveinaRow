import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' };
http.createServer(async (req,res) => {
  const name = path.resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url,'http://localhost').pathname));
  if (!name.startsWith(root + path.sep) || name.includes('/.git/') || name.includes('/.runtime/')) {res.writeHead(403).end();return;}
  try {res.setHeader('Content-Type',mime[path.extname(name)] || 'application/octet-stream');res.end(await fs.readFile(name));}
  catch {res.writeHead(404).end('Not found');}
}).listen(5173,'127.0.0.1',() => console.log('弈间预览：http://127.0.0.1:5173'));
