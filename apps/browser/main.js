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
