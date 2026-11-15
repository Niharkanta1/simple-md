import { app, BrowserWindow, nativeTheme, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { flushConfig, loadConfig } from './core/config';
import { setTrashImpl } from './core/trash';
import { registerImageProtocol, registerSchemes } from './protocol';
import { registerIpc } from './ipc';
import { createMainWindow } from './window';
import { stopWatching } from './services/watcher';

// Data location:
//  1. MDV_USER_DATA env var (tests / power users)
//  2. Portable mode: a "SimpleMarkdown-data" folder next to the portable exe
//  3. Default: %APPDATA%/Simple Markdown
const portableDir = process.env['PORTABLE_EXECUTABLE_DIR'];
if (process.env['MDV_USER_DATA']) {
  app.setPath('userData', path.resolve(process.env['MDV_USER_DATA']));
} else if (portableDir && fs.existsSync(path.join(portableDir, 'SimpleMarkdown-data'))) {
  app.setPath('userData', path.join(portableDir, 'SimpleMarkdown-data'));
}

registerSchemes();

let mainWindow: BrowserWindow | null = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const cfg = await loadConfig(app.getPath('userData'));
    nativeTheme.themeSource = cfg.theme;
    setTrashImpl((p) => shell.trashItem(p));
    registerImageProtocol();
    registerIpc(() => mainWindow);
    mainWindow = createMainWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  });

  app.on('window-all-closed', async () => {
    stopWatching();
    await flushConfig();
    app.quit();
  });
}
