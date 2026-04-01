const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const http = require('http');

// NEXUM server URL — берётся из env или дефолт для локальной разработки
const NEXUM_API = process.env.NEXUM_API || 'http://localhost:18790';

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    icon: path.join(__dirname, '../../NEXUM LOGO.PNG'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      // Позволяем webview грузить любые сайты
      webSecurity: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC: AI chat запрос от рендерера ──────────────────────────
ipcMain.handle('ai-chat', async (_event, { message, pageUrl, pageTitle, uid }) => {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      uid: uid || null,
      mode: 'chat',
      messages: [
        {
          role: 'user',
          content: pageUrl
            ? `[Контекст браузера: открыта страница "${pageTitle}" (${pageUrl})]\n\n${message}`
            : message,
        },
      ],
    });

    const req = http.request(
      `${NEXUM_API}/api/chat`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ ok: true, ...JSON.parse(data) });
          } catch {
            resolve({ ok: false, content: data });
          }
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, content: `Ошибка: ${e.message}. Проверь что NEXUM сервер запущен.` }));
    req.write(body);
    req.end();
  });
});

// ── IPC: извлечь текст страницы через webview executeJavaScript ──
ipcMain.handle('summarize-page', async (_event, { pageText, pageTitle, uid }) => {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      uid: uid || null,
      mode: 'chat',
      messages: [{
        role: 'user',
        content: `Кратко суммаризуй эту страницу («${pageTitle}») в 3-5 пунктах на русском:\n\n${pageText.slice(0, 4000)}`,
      }],
    });

    const req = http.request(
      `${NEXUM_API}/api/chat`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try { resolve({ ok: true, ...JSON.parse(data) }); }
          catch { resolve({ ok: false, content: data }); }
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, content: `Ошибка подключения: ${e.message}` }));
    req.write(body);
    req.end();
  });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

// ── IPC: Skills ───────────────────────────────────────────────
ipcMain.handle('get-skills', async (_event, { uid }) => {
  return fetchNexum(`/api/skills?uid=${uid}`);
});

// ── IPC: User Profile ─────────────────────────────────────────
ipcMain.handle('get-profile', async (_event, { uid }) => {
  return fetchNexum(`/api/profile?uid=${uid}`);
});

// ── IPC: Long-Term Memory ─────────────────────────────────────
ipcMain.handle('get-ltm', async (_event, { uid }) => {
  return fetchNexum(`/api/ltm?uid=${uid}`);
});

// ── IPC: Reminders ────────────────────────────────────────────
ipcMain.handle('get-reminders', async (_event, { uid }) => {
  return fetchNexum(`/api/reminders?uid=${uid}`);
});
ipcMain.handle('add-reminder', async (_event, { uid, text, fire_at }) => {
  return fetchNexumPost('/api/reminders', { uid, text, fire_at });
});

// ── IPC: Web Search ───────────────────────────────────────────
ipcMain.handle('nexum-search', async (_event, { query }) => {
  return fetchNexum(`/api/search?q=${encodeURIComponent(query)}`);
});

// ── IPC: Ecosystem token resolve ──────────────────────────────
ipcMain.handle('resolve-token', async (_event, { token }) => {
  return fetchNexum(`/api/ecosystem/resolve?token=${token}`);
});

// ── Helpers ───────────────────────────────────────────────────
function fetchNexum(path) {
  return new Promise((resolve) => {
    const req = http.request(`${NEXUM_API}${path}`, { method: 'GET' }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ ok: true, data: JSON.parse(data) }); }
        catch { resolve({ ok: false, data }); }
      });
    });
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.end();
  });
}

function fetchNexumPost(path, body) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      `${NEXUM_API}${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try { resolve({ ok: true, data: JSON.parse(data) }); }
          catch { resolve({ ok: false, data }); }
        });
      }
    );
    req.on('error', (e) => resolve({ ok: false, error: e.message }));
    req.write(payload);
    req.end();
  });
}
