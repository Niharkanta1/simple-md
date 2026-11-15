import { BrowserWindow, screen, shell } from 'electron';
import path from 'node:path';
import { getConfig, updateConfig } from './core/config';
import { EVENTS } from '../shared/api';
import { isCloseConfirmed } from './ipc';

function boundsVisible(b: { x?: number; y?: number; width: number; height: number }): boolean {
  if (b.x === undefined || b.y === undefined) return false;
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return b.x! < a.x + a.width - 50 && b.x! + b.width > a.x + 50 && b.y! >= a.y - 10 && b.y! < a.y + a.height - 50;
  });
}

export function createMainWindow(): BrowserWindow {
  const cfg = getConfig().window;
  const win = new BrowserWindow({
    width: cfg.width,
    height: cfg.height,
    ...(boundsVisible(cfg) ? { x: cfg.x, y: cfg.y } : {}),
    minWidth: 640,
    minHeight: 420,
    show: false,
    title: 'Simple Markdown',
    backgroundColor: '#1e1f22',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true
    }
  });
  win.setMenuBarVisibility(false);
  if (cfg.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  // Never let the renderer navigate away or open windows.
  win.webContents.on('will-navigate', (e, url) => {
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (devUrl && url.startsWith(devUrl)) return;
    e.preventDefault();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-attach-webview', (e) => e.preventDefault());

  if (process.env['MDV_DEBUG_CONSOLE']) {
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      console.log(`[renderer:${level}] ${message} (${source}:${line})`);
    });
  }

  // Ask the renderer to flush/confirm unsaved changes before closing.
  win.on('close', (e) => {
    if (isCloseConfirmed() || win.webContents.isCrashed()) {
      const maximized = win.isMaximized();
      const b = win.getNormalBounds();
      void updateConfig((c) => {
        c.window = { width: b.width, height: b.height, x: b.x, y: b.y, maximized };
      });
      return;
    }
    e.preventDefault();
    win.webContents.send(EVENTS.closeRequested);
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) void win.loadURL(devUrl);
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  return win;
}
