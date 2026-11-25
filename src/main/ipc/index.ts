import { BrowserWindow, dialog, ipcMain, nativeTheme, shell, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import type { ApiMethods } from '../../shared/api';
import { API_METHODS, EVENTS } from '../../shared/api';
import type { Envelope } from '../../shared/types';
import { AppError, toErrorPayload } from '../core/errors';
import { applySettingsPatch, getConfig, updateConfig } from '../core/config';
import { resolveInProject } from '../core/pathGuard';
import * as project from '../services/project';
import * as files from '../services/fsOps';
import * as images from '../services/images';
import * as gitignore from '../services/gitignore';
import * as archive from '../services/archive';
import * as search from '../services/search';
import { watchProject } from '../services/watcher';

type Handlers = {
  [K in keyof ApiMethods]: (
    win: BrowserWindow,
    ...args: Parameters<ApiMethods[K]>
  ) => Promise<ReturnType<ApiMethods[K]>> | ReturnType<ApiMethods[K]>;
};

// ------------------------------------------------------------------ argument checks

function str(v: unknown, what = 'argument'): string {
  if (typeof v !== 'string') throw new AppError('INVALID_ARGUMENT', `Invalid ${what}.`);
  return v;
}
function bool(v: unknown): boolean {
  if (typeof v !== 'boolean') throw new AppError('INVALID_ARGUMENT', 'Invalid flag.');
  return v;
}
function bytes(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  throw new AppError('INVALID_ARGUMENT', 'Invalid binary data.');
}

const root = (id: unknown) => project.getProjectRoot(str(id, 'project id'));

function startWatching(win: BrowserWindow, id: string, rootPath: string) {
  watchProject(id, rootPath, (pid) => {
    if (!win.isDestroyed()) win.webContents.send(EVENTS.fsChanged, pid);
  });
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ------------------------------------------------------------------ handlers

let closeConfirmed = false;
export function isCloseConfirmed(): boolean {
  return closeConfirmed;
}

const handlers: Handlers = {
  getConfig: () => getConfig(),
  updateSettings: async (_w, patch) => {
    const cfg = await updateConfig((c) => applySettingsPatch(c, patch));
    nativeTheme.themeSource = cfg.theme;
    return cfg;
  },
  openExternal: async (_w, url) => {
    const u = new URL(str(url, 'url'));
    if (!['http:', 'https:', 'mailto:'].includes(u.protocol)) throw new AppError('FORBIDDEN', 'Only web and mail links can be opened.');
    await shell.openExternal(u.toString());
  },
  confirmClose: (win) => {
    closeConfirmed = true;
    setImmediate(() => win.close());
  },

  // projects
  listProjects: () => project.listProjects(),
  createProject: async (win, name) => {
    const n = str(name, 'name').trim();
    const res = await dialog.showOpenDialog(win, {
      title: `Choose where to create "${n}"`,
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Create Here'
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const p = await project.createProject(res.filePaths[0], n);
    startWatching(win, p.id, p.rootPath);
    return p;
  },
  openFolderAsProject: async (win) => {
    const res = await dialog.showOpenDialog(win, { title: 'Open Folder as Project', properties: ['openDirectory', 'createDirectory'] });
    if (res.canceled || !res.filePaths[0]) return null;
    const p = await project.openFolderAsProject(res.filePaths[0]);
    startWatching(win, p.id, p.rootPath);
    return p;
  },
  activateProject: async (win, id) => {
    const p = await project.activateProject(str(id, 'project id'));
    startWatching(win, p.id, p.rootPath);
    return p;
  },
  renameProject: (_w, id, name) => project.renameProject(str(id), str(name)),
  removeProjectFromList: (_w, id) => project.removeProjectFromList(str(id)),
  deleteProject: (_w, id) => project.deleteProject(str(id)),
  locateProject: async (win, id) => {
    const res = await dialog.showOpenDialog(win, { title: 'Locate Project Folder', properties: ['openDirectory'] });
    if (res.canceled || !res.filePaths[0]) return null;
    const p = await project.locateProject(str(id), res.filePaths[0]);
    startWatching(win, p.id, p.rootPath);
    return p;
  },
  updateProjectMeta: (_w, id, patch) => project.updateProjectMeta(str(id), patch),

  // files
  listTree: async (_w, id) => files.listTree(await root(id)),
  readFile: async (_w, id, p) => files.readFile(await root(id), str(p, 'path')),
  writeFile: async (_w, id, p, content) => files.writeFile(await root(id), str(p, 'path'), str(content, 'content')),
  createFile: async (_w, id, dir, name) => files.createFile(await root(id), str(dir, 'folder'), str(name, 'name')),
  createDir: async (_w, id, dir, name) => files.createDir(await root(id), str(dir, 'folder'), str(name, 'name')),
  renameEntry: async (_w, id, p, name) => files.renameEntry(await root(id), str(p, 'path'), str(name, 'name')),
  moveEntry: async (_w, id, p, target) => files.moveEntry(await root(id), str(p, 'path'), str(target, 'folder')),
  deleteEntry: async (_w, id, p, inc) => files.deleteEntry(await root(id), str(p, 'path'), bool(inc)),
  entryInfo: async (_w, id, p) => files.entryInfo(await root(id), str(p, 'path')),
  revealInExplorer: async (_w, id, p) => {
    const abs = await resolveInProject(await root(id), str(p, 'path'));
    shell.showItemInFolder(abs);
  },

  // search
  searchProject: async (_w, id, q) => search.searchProject(await root(id), str(q, 'query').slice(0, 500)),

  // images
  savePastedImage: async (_w, id, md, data, ext) =>
    images.savePastedImage(await root(id), str(md, 'path'), bytes(data), typeof ext === 'string' ? ext : 'png'),
  importDroppedImages: async (_w, id, md, absPaths) => {
    if (!Array.isArray(absPaths) || absPaths.length > 50) throw new AppError('INVALID_ARGUMENT', 'Invalid file list.');
    const r = await root(id);
    const out: string[] = [];
    for (const p of absPaths) out.push(await images.importImageFile(r, str(md, 'path'), str(p, 'path')));
    return out;
  },
  pickAndImportImages: async (win, id, md) => {
    const r = await root(id);
    const res = await dialog.showOpenDialog(win, {
      title: 'Insert Images',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: images.IMAGE_EXTS }]
    });
    if (res.canceled) return [];
    const out: string[] = [];
    for (const p of res.filePaths) out.push(await images.importImageFile(r, str(md, 'path'), p));
    return out;
  },

  // gitignore
  getGitignore: async (_w, id) => gitignore.getGitignore(await root(id)),
  setGitignore: async (_w, id, content) => gitignore.setGitignore(await root(id), str(content, 'content')),
  addIgnoreRule: async (_w, id, pattern) => gitignore.addIgnoreRule(await root(id), str(pattern, 'pattern')),
  removeIgnoreRule: async (_w, id, pattern) => gitignore.removeIgnoreRule(await root(id), str(pattern, 'pattern')),
  getIgnored: async (_w, id) => gitignore.getIgnored(await root(id)),
  gitignorePresets: () => gitignore.PRESETS,

  // import / export
  exportFile: async (win, id, md) => {
    const r = await root(id);
    const mdRel = str(md, 'path');
    const base = images.stemOf(path.basename(mdRel));
    const res = await dialog.showSaveDialog(win, {
      title: 'Export File as ZIP',
      defaultPath: `${base}.zip`,
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }]
    });
    if (res.canceled || !res.filePath) return null;
    return archive.exportFile(r, mdRel, res.filePath);
  },
  exportProject: async (win, id, respect) => {
    const r = await root(id);
    const res = await dialog.showSaveDialog(win, {
      title: 'Export Project as ZIP',
      defaultPath: `${path.basename(r)}-${stamp()}.zip`,
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }]
    });
    if (res.canceled || !res.filePath) return null;
    return archive.exportProject(r, res.filePath, bool(respect));
  },
  importZipAsProject: async (win) => {
    const zip = await dialog.showOpenDialog(win, {
      title: 'Import Project from ZIP',
      properties: ['openFile'],
      filters: [{ name: 'ZIP archive', extensions: ['zip'] }]
    });
    if (zip.canceled || !zip.filePaths[0]) return null;
    const parent = await dialog.showOpenDialog(win, {
      title: 'Choose where to place the imported project',
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Import Here'
    });
    if (parent.canceled || !parent.filePaths[0]) return null;
    const summary = await archive.importZipAsProject(zip.filePaths[0], parent.filePaths[0]);
    if (summary.project) startWatching(win, summary.project.id, summary.project.rootPath);
    return summary;
  },
  importIntoProject: async (win, id, target) => {
    const r = await root(id);
    const res = await dialog.showOpenDialog(win, {
      title: 'Import Markdown or ZIP',
      properties: ['openFile'],
      filters: [
        { name: 'Markdown or ZIP', extensions: ['md', 'markdown', 'zip'] },
        { name: 'All files', extensions: ['*'] }
      ]
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return archive.importIntoProject(r, str(target, 'folder'), res.filePaths[0]);
  }
};

// ------------------------------------------------------------------ registration

function senderAllowed(event: IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? '';
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl && url.startsWith(devUrl)) return true;
  return url.startsWith('file://');
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  for (const method of API_METHODS) {
    const fn = handlers[method] as (win: BrowserWindow, ...a: unknown[]) => unknown;
    ipcMain.handle(`api:${method}`, async (event, ...args): Promise<Envelope<unknown>> => {
      try {
        if (!senderAllowed(event)) throw new AppError('FORBIDDEN', 'Untrusted sender.');
        const win = BrowserWindow.fromWebContents(event.sender) ?? getWindow();
        if (!win) throw new AppError('IO', 'No window.');
        const data = await fn(win, ...args);
        return { ok: true, data: data === undefined ? null : data };
      } catch (err) {
        if (!(err instanceof AppError)) console.error(`[ipc] ${method} failed:`, err);
        return { ok: false, error: toErrorPayload(err) };
      }
    });
  }
}
