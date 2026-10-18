// Editor de save do Idle Slayer — servidor local (sem dependências).
// Lê e grava os .sav da pasta do jogo e serve a interface em http://localhost:5540
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const PORT = Number(arg('--port') || process.env.PORT) || 5540;
const SAVE_DIR = arg('--dir') || process.env.IDLE_SLAYER_SAVE_DIR
  || path.join(os.homedir(), 'AppData', 'LocalLow', 'Pablo Leban', 'Idle Slayer');
const BACKUP_DIR = path.join(SAVE_DIR, 'editor-backups');
// Configuração remota (Firebase) que o jogo baixa: traz o calendário dos eventos do mapa.
const REMOTE_CONFIG = path.join(os.homedir(), 'AppData', 'Local', 'com.pabloleban.IdleSlayer', '__FIRAPP_DEFAULT', 'remote_config_data');
const URL_BASE = `http://localhost:${PORT}`;

const STATIC = {
  '/': ['public/index.html', 'text/html; charset=utf-8'],
  '/app.js': ['public/app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['public/style.css', 'text/css; charset=utf-8'],
  '/data/catalog.json': ['data/catalog.json', 'application/json; charset=utf-8'],
  '/data/icons.json': ['data/icons.json', 'application/json; charset=utf-8'],
};

const SAV_NAME = /^[\w\-. ()]+\.sav$/i;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function listSavs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => SAV_NAME.test(n))
    .map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, size: st.size, mtime: st.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
}

function gameRunning() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(false);
    exec('tasklist /FI "IMAGENAME eq Idle Slayer.exe" /NH', (err, out) => {
      resolve(!err && /Idle Slayer\.exe/i.test(out));
    });
  });
}

function mapEvents() {
  try {
    const m = fs.readFileSync(REMOTE_CONFIG, 'latin1').match(/\{"events":\[[^\]]*\]\}/);
    return m ? JSON.parse(m[0]).events : null;
  } catch {
    return null;
  }
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function backup(name) {
  const src = path.join(SAVE_DIR, name);
  if (!fs.existsSync(src)) return null;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dest = `${path.basename(name, '.sav')}-${stamp()}.sav`;
  fs.copyFileSync(src, path.join(BACKUP_DIR, dest));
  return dest;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 50 * 1024 * 1024) { reject(new Error('Arquivo grande demais')); req.destroy(); }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  const name = url.searchParams.get('name') || 'savedata.sav';
  if (!SAV_NAME.test(name) || path.basename(name) !== name) return send(res, 400, { error: 'Nome de arquivo inválido' });

  if (url.pathname === '/api/info' && req.method === 'GET') {
    return send(res, 200, {
      saveDir: SAVE_DIR,
      exists: fs.existsSync(SAVE_DIR),
      files: listSavs(SAVE_DIR),
      backups: listSavs(BACKUP_DIR).slice(0, 30),
      gameRunning: await gameRunning(),
      events: mapEvents(),
    });
  }

  if (url.pathname === '/api/save' && req.method === 'GET') {
    const file = path.join(SAVE_DIR, name);
    if (!fs.existsSync(file)) return send(res, 404, { error: `Não achei ${name} em ${SAVE_DIR}` });
    return send(res, 200, fs.readFileSync(file), 'application/octet-stream');
  }

  if (url.pathname === '/api/save' && req.method === 'PUT') {
    const body = await readBody(req);
    if (body.length < 100) return send(res, 400, { error: 'Conteúdo vazio ou inválido' });
    fs.mkdirSync(SAVE_DIR, { recursive: true });
    const bak = backup(name);
    const file = path.join(SAVE_DIR, name);
    fs.writeFileSync(`${file}.tmp`, body);
    fs.renameSync(`${file}.tmp`, file);
    console.log(`Salvo ${name} (${body.length} bytes)${bak ? `, backup: ${bak}` : ''}`);
    return send(res, 200, { ok: true, backup: bak });
  }

  if (url.pathname === '/api/restore' && req.method === 'POST') {
    const src = path.join(BACKUP_DIR, name);
    if (!fs.existsSync(src)) return send(res, 404, { error: 'Backup não encontrado' });
    const bak = backup('savedata.sav');
    fs.copyFileSync(src, path.join(SAVE_DIR, 'savedata.sav'));
    console.log(`Restaurado ${name} -> savedata.sav`);
    return send(res, 200, { ok: true, backup: bak });
  }

  return send(res, 404, { error: 'Rota desconhecida' });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, URL_BASE);
    if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
    const entry = STATIC[url.pathname];
    if (!entry || req.method !== 'GET') return send(res, 404, 'Não encontrado', 'text/plain; charset=utf-8');
    return send(res, 200, fs.readFileSync(path.join(__dirname, entry[0])), entry[1]);
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: err.message });
  }
});

function openBrowser() {
  if (process.argv.includes('--no-open') || process.platform !== 'win32') return;
  exec(`start "" "${URL_BASE}"`);
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`O editor já está rodando em ${URL_BASE} — abrindo o navegador.`);
    openBrowser();
    setTimeout(() => process.exit(0), 500);
  } else {
    throw err;
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Editor de save do Idle Slayer em ${URL_BASE}`);
  console.log(`Pasta do save: ${SAVE_DIR}`);
  console.log('Deixe esta janela aberta enquanto usa o editor. Feche para encerrar.');
  openBrowser();
});
