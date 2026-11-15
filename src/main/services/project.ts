import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { OpenProject, ProjectMeta, ProjectMetaPatch, ProjectSummary, ViewMode } from '../../shared/types';
import { AppError, isErrno } from '../core/errors';
import { atomicWrite } from '../core/atomicWrite';
import { getConfig, updateConfig } from '../core/config';
import { normalizeRel, validateName } from '../core/pathGuard';
import { moveToTrash } from '../core/trash';

export const META_DIR = '.mdviewer';
export const META_FILE = 'project.json';

const VIEW_MODES: ViewMode[] = ['editor', 'split', 'preview'];

function metaPath(root: string): string {
  return path.join(root, META_DIR, META_FILE);
}

function nowIso(): string {
  return new Date().toISOString();
}

function freshMeta(name: string): ProjectMeta {
  const now = nowIso();
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    name,
    description: '',
    createdAt: now,
    updatedAt: now,
    lastOpenFile: null,
    recentFiles: [],
    expandedFolders: [],
    settings: { viewMode: null }
  };
}

function safeRelList(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const item of v) {
    if (typeof item !== 'string') continue;
    try {
      const n = normalizeRel(item);
      if (n && !out.includes(n)) out.push(n);
    } catch {
      /* drop invalid */
    }
    if (out.length >= max) break;
  }
  return out;
}

function sanitizeMeta(raw: unknown, fallbackName: string): ProjectMeta {
  const m = freshMeta(fallbackName);
  if (!raw || typeof raw !== 'object') return m;
  const r = raw as Partial<ProjectMeta>;
  if (typeof r.id === 'string' && /^[0-9a-f-]{36}$/i.test(r.id)) m.id = r.id.toLowerCase();
  if (typeof r.name === 'string' && r.name.trim()) m.name = r.name.trim().slice(0, 200);
  if (typeof r.description === 'string') m.description = r.description.slice(0, 2000);
  if (typeof r.createdAt === 'string') m.createdAt = r.createdAt;
  if (typeof r.updatedAt === 'string') m.updatedAt = r.updatedAt;
  if (typeof r.lastOpenFile === 'string') {
    try {
      m.lastOpenFile = normalizeRel(r.lastOpenFile) || null;
    } catch {
      m.lastOpenFile = null;
    }
  }
  m.recentFiles = safeRelList(r.recentFiles, 10);
  m.expandedFolders = safeRelList(r.expandedFolders, 500);
  const vm = r.settings?.viewMode;
  m.settings.viewMode = vm && VIEW_MODES.includes(vm) ? vm : null;
  return m;
}

export async function readMeta(root: string): Promise<ProjectMeta | null> {
  try {
    const raw = JSON.parse(await fs.readFile(metaPath(root), 'utf8'));
    return sanitizeMeta(raw, path.basename(root));
  } catch (err) {
    if (isErrno(err, 'ENOENT')) return null;
    // Corrupt metadata: rebuild rather than fail.
    return null;
  }
}

export async function writeMeta(root: string, meta: ProjectMeta): Promise<void> {
  await fs.mkdir(path.join(root, META_DIR), { recursive: true });
  await atomicWrite(metaPath(root), JSON.stringify(meta, null, 2) + '\n');
}

/** Reads metadata, creating it if missing. Optionally forces a fresh id. */
export async function ensureMeta(root: string, opts: { newId?: boolean; name?: string } = {}): Promise<ProjectMeta> {
  let meta = await readMeta(root);
  let changed = false;
  if (!meta) {
    meta = freshMeta(opts.name ?? path.basename(root));
    changed = true;
  }
  if (opts.newId) {
    meta.id = crypto.randomUUID();
    changed = true;
  }
  if (opts.name && meta.name !== opts.name) {
    meta.name = opts.name;
    changed = true;
  }
  if (changed) await writeMeta(root, meta);
  return meta;
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

function toOpen(meta: ProjectMeta, root: string): OpenProject {
  return { ...meta, rootPath: root };
}

// ---------------------------------------------------------------- registry

export async function listProjects(): Promise<ProjectSummary[]> {
  const cfg = getConfig();
  const out: ProjectSummary[] = [];
  for (const p of cfg.projects) {
    out.push({ ...p, available: await isDirectory(p.path) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** Absolute root path for a registered project, verifying it still exists. */
export async function getProjectRoot(projectId: string): Promise<string> {
  if (typeof projectId !== 'string') throw new AppError('INVALID_ARGUMENT', 'Invalid project id.');
  const entry = getConfig().projects.find((p) => p.id === projectId);
  if (!entry) throw new AppError('NOT_FOUND', 'Project not found.');
  if (!(await isDirectory(entry.path))) {
    throw new AppError('PROJECT_UNAVAILABLE', `Project folder not found: ${entry.path}`);
  }
  return entry.path;
}

function samePath(a: string, b: string): boolean {
  const ra = path.resolve(a);
  const rb = path.resolve(b);
  return process.platform === 'win32' ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}

/** Adds (or updates) a project in the registry and marks it active. */
async function register(root: string, meta: ProjectMeta): Promise<ProjectMeta> {
  const cfg = getConfig();
  // Same folder already registered -> reuse that entry.
  const byPath = cfg.projects.find((p) => samePath(p.path, root));
  // A different folder carries the same id (e.g. a copied project) -> give this one a new id.
  const byId = cfg.projects.find((p) => p.id === meta.id);
  if (byId && !samePath(byId.path, root)) {
    meta = await ensureMeta(root, { newId: true });
  }
  const now = nowIso();
  await updateConfig((c) => {
    c.projects = c.projects.filter((p) => !(byPath && p.id === byPath.id) && p.id !== meta.id);
    c.projects.push({ id: meta.id, name: meta.name, path: path.resolve(root), lastOpenedAt: now });
    c.activeProjectId = meta.id;
  });
  return meta;
}

// ---------------------------------------------------------------- operations

export async function createProject(parentAbs: string, name: string): Promise<OpenProject> {
  validateName(name);
  if (!(await isDirectory(parentAbs))) throw new AppError('NOT_FOUND', 'Location folder not found.');
  const root = path.join(parentAbs, name);
  try {
    await fs.mkdir(root);
  } catch (err) {
    if (isErrno(err, 'EEXIST')) throw new AppError('ALREADY_EXISTS', `A folder named "${name}" already exists there.`);
    throw err;
  }
  const meta = freshMeta(name);
  await writeMeta(root, meta);
  const readme = `# ${name}\n\nWelcome to your new project. Create files and folders from the sidebar.\n`;
  await fs.writeFile(path.join(root, 'README.md'), readme, { flag: 'wx' });
  meta.lastOpenFile = 'README.md';
  meta.recentFiles = ['README.md'];
  await writeMeta(root, meta);
  const registered = await register(root, meta);
  return toOpen(registered, path.resolve(root));
}

export async function openFolderAsProject(folderAbs: string): Promise<OpenProject> {
  const root = path.resolve(folderAbs);
  if (!(await isDirectory(root))) throw new AppError('NOT_FOUND', 'Folder not found.');
  if (path.parse(root).root === root) {
    throw new AppError('FORBIDDEN', 'A drive root cannot be used as a project. Choose or create a folder.');
  }
  const meta = await ensureMeta(root);
  const registered = await register(root, meta);
  return toOpen(registered, root);
}

export async function activateProject(projectId: string): Promise<OpenProject> {
  const root = await getProjectRoot(projectId);
  const meta = await ensureMeta(root);
  if (meta.id !== projectId) {
    // project.json was replaced/edited externally; keep the registry id authoritative.
    meta.id = projectId;
    await writeMeta(root, meta);
  }
  await updateConfig((c) => {
    c.activeProjectId = projectId;
    const e = c.projects.find((p) => p.id === projectId);
    if (e) {
      e.lastOpenedAt = nowIso();
      e.name = meta.name;
    }
  });
  return toOpen(meta, root);
}

export async function renameProject(projectId: string, newName: string): Promise<OpenProject> {
  const name = typeof newName === 'string' ? newName.trim() : '';
  if (!name) throw new AppError('INVALID_NAME', 'Project name cannot be empty.');
  if (name.length > 200) throw new AppError('INVALID_NAME', 'Project name is too long.');
  const root = await getProjectRoot(projectId);
  const meta = await ensureMeta(root);
  meta.name = name;
  meta.updatedAt = nowIso();
  await writeMeta(root, meta);
  await updateConfig((c) => {
    const e = c.projects.find((p) => p.id === projectId);
    if (e) e.name = name;
  });
  return toOpen(meta, root);
}

export async function removeProjectFromList(projectId: string): Promise<void> {
  await updateConfig((c) => {
    c.projects = c.projects.filter((p) => p.id !== projectId);
    if (c.activeProjectId === projectId) c.activeProjectId = null;
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  const root = await getProjectRoot(projectId);
  await moveToTrash(root);
  await removeProjectFromList(projectId);
}

export async function locateProject(projectId: string, newRootAbs: string): Promise<OpenProject> {
  const root = path.resolve(newRootAbs);
  if (!(await isDirectory(root))) throw new AppError('NOT_FOUND', 'Folder not found.');
  const cfg = getConfig();
  if (!cfg.projects.some((p) => p.id === projectId)) throw new AppError('NOT_FOUND', 'Project not found.');
  const meta = await ensureMeta(root);
  meta.id = projectId;
  await writeMeta(root, meta);
  await updateConfig((c) => {
    c.projects = c.projects.filter((p) => p.id === projectId || !samePath(p.path, root));
    const e = c.projects.find((p) => p.id === projectId);
    if (e) {
      e.path = root;
      e.name = meta.name;
    }
    c.activeProjectId = projectId;
  });
  return toOpen(meta, root);
}

export async function updateProjectMeta(projectId: string, patch: ProjectMetaPatch): Promise<OpenProject> {
  const root = await getProjectRoot(projectId);
  const meta = await ensureMeta(root);
  const merged = sanitizeMeta(
    {
      ...meta,
      ...(patch && typeof patch === 'object' ? patch : {}),
      id: meta.id,
      name: meta.name,
      settings: { ...meta.settings, ...(patch?.settings ?? {}) }
    },
    meta.name
  );
  merged.updatedAt = nowIso();
  await writeMeta(root, merged);
  return toOpen(merged, root);
}

/** Registers an already-extracted project folder (used by import). */
export async function registerImportedProject(root: string, name: string): Promise<OpenProject> {
  const meta = await ensureMeta(root, { newId: true, name });
  const registered = await register(root, meta);
  return toOpen(registered, path.resolve(root));
}
