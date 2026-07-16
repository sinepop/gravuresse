const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.on('window-all-closed', event => event.preventDefault());

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs', 'prototypes', 'screens');
const shots = [
  ['home', '01-start-home.png', 1280, 900],
  ['creation', '02-guided-creation.png', 1280, 900],
  ['edit', '03-simple-edit.png', 1280, 900],
  ['connections', '04-connection-wizard.png', 1280, 900],
  ['spec', '05-ui-specification.png', 1280, 1100],
];
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!rel) rel = 'docs/prototypes/gravuresse-vnext-prototype.html';
    const file = path.resolve(root, rel);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': mime[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function capture(baseUrl, screen, filename, width, height) {
  const win = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    frame: false,
    show: false,
    backgroundColor: '#0B0D10',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });
  const messages = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) messages.push({ level, message });
  });
  win.webContents.on('did-fail-load', (_event, code, desc, url) => {
    messages.push({ level: 3, message: `load failed ${code} ${desc} ${url}` });
  });
  const url = `${baseUrl}/docs/prototypes/gravuresse-vnext-prototype.html?screen=${screen}`;
  await win.loadURL(url);
  await delay(550);
  const image = await win.capturePage();
  const out = path.join(outDir, filename);
  fs.writeFileSync(out, image.toPNG());
  const bytes = fs.statSync(out).size;
  win.destroy();
  return { screen, filename, bytes, messages };
}

app.whenReady().then(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) {
    if (/\.png$/i.test(f)) fs.rmSync(path.join(outDir, f));
  }
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const results = [];
  try {
    for (const [screen, filename, width, height] of shots) {
      results.push(await capture(baseUrl, screen, filename, width, height));
    }
  } finally {
    server.close();
  }
  console.log(JSON.stringify(results, null, 2));
  const hasErrors = results.some(r => r.messages.length || r.bytes < 10000);
  await app.quit();
  if (hasErrors) process.exitCode = 1;
}).catch(async err => {
  console.error(err);
  process.exitCode = 1;
  try { await app.quit(); } catch {}
});
