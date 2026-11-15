import fs from 'node:fs/promises';
import path from 'node:path';
import type { AppConfig, SettingsPatch, ThemeSetting, ViewMode } from '../../shared/types';
import { atomicWrite } from './atomicWrite';

export const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: 1,
  projects: [],
  activeProjectId: null,
  theme: 'system',
  autosave: { enabled: true, delayMs: 1000 },
  sidebar: { width: 280, collapsed: false },
  defaultViewMode: 'split',
  window: { width: 1280, height: 800, maximized: false }
};

let configFile = '';
let current: AppConfig = structuredClone(DEFAULT_CONFIG);
let writeChain: Promise<void> = Promise.resolve();

const THEMES: ThemeSetting[] = ['system', 'light', 'dark'];
const VIEW_MODES: ViewMode[] = ['editor', 'split', 'preview'];

function sanitize(raw: unknown): AppConfig {
  const c = structuredClone(DEFAULT_CONFIG);
  if (!raw || typeof raw !== 'object') return c;
  const r = raw as Partial<AppConfig>;
  if (Array.isArray(r.projects)) {
    c.projects = r.projects
      .filter((p) => p && typeof p.id === 'string' && typeof p.path === 'string')
      .map((p) => ({
        id: p.id,
        path: p.path,
        name: typeof p.name === 'string' ? p.name : path.basename(p.path),
        lastOpenedAt: typeof p.lastOpenedAt === 'string' ? p.lastOpenedAt : new Date(0).toISOString()
      }));
  }
  if (typeof r.activeProjectId === 'string') c.activeProjectId = r.activeProjectId;
  if (r.theme && THEMES.includes(r.theme)) c.theme = r.theme;
  if (r.autosave && typeof r.autosave === 'object') {
    if (typeof r.autosave.enabled === 'boolean') c.autosave.enabled = r.autosave.enabled;
    if (typeof r.autosave.delayMs === 'number') c.autosave.delayMs = clampDelay(r.autosave.delayMs);
  }
  if (r.sidebar && typeof r.sidebar === 'object') {
    if (typeof r.sidebar.width === 'number') c.sidebar.width = clampWidth(r.sidebar.width);
    if (typeof r.sidebar.collapsed === 'boolean') c.sidebar.collapsed = r.sidebar.collapsed;
  }
  if (r.defaultViewMode && VIEW_MODES.includes(r.defaultViewMode)) c.defaultViewMode = r.defaultViewMode;
  if (r.window && typeof r.window === 'object') {
    const w = r.window;
    if (typeof w.width === 'number' && w.width >= 400) c.window.width = Math.round(w.width);
    if (typeof w.height === 'number' && w.height >= 300) c.window.height = Math.round(w.height);
    if (typeof w.x === 'number') c.window.x = Math.round(w.x);
    if (typeof w.y === 'number') c.window.y = Math.round(w.y);
    if (typeof w.maximized === 'boolean') c.window.maximized = w.maximized;
  }
  return c;
}

const clampDelay = (n: number) => Math.min(60000, Math.max(200, Math.round(n)));
const clampWidth = (n: number) => Math.min(800, Math.max(160, Math.round(n)));

export async function loadConfig(dir: string): Promise<AppConfig> {
  configFile = path.join(dir, 'config.json');
  await fs.mkdir(dir, { recursive: true });
  try {
    current = sanitize(JSON.parse(await fs.readFile(configFile, 'utf8')));
  } catch {
    current = structuredClone(DEFAULT_CONFIG);
  }
  return getConfig();
}

export function getConfig(): AppConfig {
  return structuredClone(current);
}

/** Applies a mutation and persists (writes are serialised). */
export async function updateConfig(mutate: (c: AppConfig) => void): Promise<AppConfig> {
  const next = structuredClone(current);
  mutate(next);
  current = sanitize(next);
  const snapshot = JSON.stringify(current, null, 2);
  writeChain = writeChain.catch(() => {}).then(() => (configFile ? atomicWrite(configFile, snapshot) : undefined));
  await writeChain;
  return getConfig();
}

/** Resolves once all queued config writes are on disk. */
export function flushConfig(): Promise<void> {
  return writeChain.catch(() => {});
}

export function applySettingsPatch(c: AppConfig, patch: SettingsPatch): void {
  if (!patch || typeof patch !== 'object') return;
  if (patch.theme !== undefined) c.theme = patch.theme;
  if (patch.autosave) Object.assign(c.autosave, patch.autosave);
  if (patch.sidebar) Object.assign(c.sidebar, patch.sidebar);
  if (patch.defaultViewMode !== undefined) c.defaultViewMode = patch.defaultViewMode;
}
