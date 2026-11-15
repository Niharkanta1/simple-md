import type { OpenProject, SettingsPatch, TreeNode, ViewMode } from '../../../shared/types';
import { api, ApiError } from './api';
import { choose, confirm, prompt, showError, toast } from './dialogs';
import { doc, projects, settings, tree, ui } from './state.svelte';
import { debounce } from './util/debounce';
import { basename, dirname, fileKind, isWithin, join, remap } from './util/paths';
import { nameProblem } from './util/names';

const activeId = (): string | null => projects.active?.id ?? null;

// =================================================================== theme

const media = window.matchMedia('(prefers-color-scheme: dark)');
export function applyTheme(): void {
  const t = settings.cfg?.theme ?? 'system';
  ui.resolvedTheme = t === 'system' ? (media.matches ? 'dark' : 'light') : t;
  document.documentElement.dataset.theme = ui.resolvedTheme;
}
media.addEventListener('change', applyTheme);

// =================================================================== settings

export async function updateSettings(patch: SettingsPatch): Promise<void> {
  try {
    settings.cfg = await api.updateSettings(patch);
    applyTheme();
    if (patch.autosave?.enabled === false) autosave.cancel();
    if (patch.autosave?.enabled === true && doc.dirty) scheduleAutosave();
  } catch (e) {
    showError(e);
  }
}

export const persistSidebar = debounce(() => {
  void updateSettings({ sidebar: { width: ui.sidebarWidth, collapsed: ui.sidebarCollapsed } });
}, 400);

export function toggleAutosave(): void {
  const enabled = !settings.autosave;
  void updateSettings({ autosave: { enabled } });
  toast(`Autosave ${enabled ? 'on' : 'off'}`);
}

// =================================================================== project metadata

const persistMeta = debounce(async () => {
  const p = projects.active;
  if (!p) return;
  try {
    const updated = await api.updateProjectMeta(p.id, {
      lastOpenFile: doc.path,
      recentFiles: p.recentFiles,
      expandedFolders: [...tree.expanded],
      settings: { viewMode: ui.viewMode }
    });
    if (projects.active?.id === updated.id) {
      projects.active.updatedAt = updated.updatedAt;
    }
  } catch {
    /* project may have been removed; ignore */
  }
}, 500);

export function setViewMode(mode: ViewMode): void {
  ui.viewMode = mode;
  persistMeta();
}

export function toggleFolder(path: string, open?: boolean): void {
  const isOpen = tree.expanded.has(path);
  const want = open ?? !isOpen;
  if (want) tree.expanded.add(path);
  else tree.expanded.delete(path);
  persistMeta();
}

function expandAncestors(path: string): void {
  let d = dirname(path);
  while (d) {
    tree.expanded.add(d);
    d = dirname(d);
  }
}

function pushRecent(path: string): void {
  const p = projects.active;
  if (!p) return;
  p.recentFiles = [path, ...p.recentFiles.filter((r) => r !== path)].slice(0, 10);
}

// =================================================================== saving

let saveChain: Promise<boolean> = Promise.resolve(true);

/** Writes the current document if dirty. Resolves true on success (or nothing to do). */
export function saveNow(): Promise<boolean> {
  autosave.cancel();
  saveChain = saveChain.then(async () => {
    const id = activeId();
    if (!doc.dirty || !doc.path || !id) return true;
    const version = doc.version;
    const content = doc.content;
    const path = doc.path;
    doc.saving = true;
    try {
      await api.writeFile(id, path, content);
      if (doc.path === path) {
        doc.savedContent = content;
        doc.savedVersion = version;
        doc.saveError = null;
      }
      return true;
    } catch (e) {
      doc.saveError = e instanceof Error ? e.message : String(e);
      showError(e);
      return false;
    } finally {
      doc.saving = false;
    }
  });
  return saveChain;
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
const autosave = {
  cancel(): void {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
};

function scheduleAutosave(): void {
  if (!settings.autosave) return;
  autosave.cancel();
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    if (settings.autosave) void saveNow();
  }, settings.autosaveDelay);
}

/** Called by the editor on every change. */
export function setContent(text: string): void {
  if (text === doc.content) return;
  doc.content = text;
  doc.version++;
  if (doc.content === doc.savedContent) {
    doc.savedVersion = doc.version; // edited back to the saved state
    autosave.cancel();
    return;
  }
  scheduleAutosave();
}

/**
 * Makes sure there are no unsaved changes before switching away.
 * Autosave on: saves immediately. Autosave off: asks the user.
 * Returns false if the user cancelled or saving failed.
 */
export async function ensureSaved(): Promise<boolean> {
  if (!doc.dirty) return true;
  if (settings.autosave) return saveNow();
  const choice = await choose({
    title: 'Unsaved changes',
    message: `Do you want to save the changes you made to "${basename(doc.path ?? '')}"?`,
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: "Don't Save", value: 'discard' },
      { label: 'Save', value: 'save', variant: 'primary' }
    ]
  });
  if (choice === 'save') return saveNow();
  if (choice === 'discard') {
    autosave.cancel();
    doc.content = doc.savedContent;
    doc.savedVersion = doc.version;
    return true;
  }
  return false;
}

// =================================================================== documents

function loadDoc(path: string | null, kind: ReturnType<typeof fileKind> | null, content: string): void {
  autosave.cancel();
  doc.path = path;
  doc.kind = kind;
  doc.content = content;
  doc.savedContent = content;
  doc.version = 0;
  doc.savedVersion = 0;
  doc.saveError = null;
  doc.loadToken++;
}

export function closeDoc(): void {
  loadDoc(null, null, '');
}

export async function openFile(path: string, opts: { force?: boolean } = {}): Promise<void> {
  const id = activeId();
  if (!id) return;
  if (doc.path === path && !opts.force) return;
  if (!(await ensureSaved())) return;
  const kind = fileKind(path);
  if (kind === 'other') {
    toast('This file type cannot be opened here. Showing it in File Explorer.');
    await api.revealInExplorer(id, path).catch(showError);
    return;
  }
  try {
    const content = kind === 'image' ? '' : await api.readFile(id, path);
    loadDoc(path, kind, content);
    tree.selected = path;
    expandAncestors(path);
    pushRecent(path);
    persistMeta();
  } catch (e) {
    showError(e);
  }
}

// =================================================================== tree

export function findNode(path: string, node: TreeNode | null = tree.root): TreeNode | null {
  if (!node) return null;
  if (node.path === path) return node;
  for (const c of node.children ?? []) {
    if (isWithin(path, c.path)) {
      const hit = findNode(path, c);
      if (hit) return hit;
    }
  }
  return null;
}

export function allFiles(node: TreeNode | null = tree.root, out: string[] = []): string[] {
  if (!node) return out;
  for (const c of node.children ?? []) {
    if (c.type === 'file') out.push(c.path);
    else allFiles(c, out);
  }
  return out;
}

let refreshing: Promise<void> | null = null;
export async function refreshTree(): Promise<void> {
  const id = activeId();
  if (!id) return;
  const run = async () => {
    try {
      const [root, ignored, gi] = await Promise.all([api.listTree(id), api.getIgnored(id), api.getGitignore(id)]);
      if (activeId() !== id) return;
      tree.root = root;
      tree.ignored.clear();
      for (const p of ignored) tree.ignored.add(p);
      tree.rules = gi.rules;
      const p = projects.active;
      if (p) {
        const files = new Set(allFiles(root));
        const pruned = p.recentFiles.filter((r) => files.has(r));
        if (pruned.length !== p.recentFiles.length) {
          p.recentFiles = pruned;
          persistMeta();
        }
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PROJECT_UNAVAILABLE') {
        toast('The project folder is no longer available.', 'error');
        await refreshProjects();
      } else showError(e);
    }
  };
  // Coalesce concurrent refreshes.
  if (refreshing) await refreshing;
  refreshing = run().finally(() => (refreshing = null));
  return refreshing;
}

export function isIgnored(path: string): boolean {
  if (tree.ignored.size === 0) return false;
  let p = path;
  while (p) {
    if (tree.ignored.has(p)) return true;
    p = dirname(p);
  }
  return false;
}

// =================================================================== projects

export async function refreshProjects(): Promise<void> {
  try {
    projects.list = await api.listProjects();
  } catch (e) {
    showError(e);
  }
}

async function setActiveProject(p: OpenProject): Promise<void> {
  persistMeta.flush();
  closeDoc();
  projects.active = p;
  tree.root = null;
  tree.selected = null;
  tree.expanded.clear();
  for (const f of p.expandedFolders) tree.expanded.add(f);
  ui.viewMode = p.settings.viewMode ?? settings.cfg?.defaultViewMode ?? 'split';
  await Promise.all([refreshTree(), refreshProjects()]);
  if (p.lastOpenFile && findNode(p.lastOpenFile)) await openFile(p.lastOpenFile);
}

async function guardThen<T>(fn: () => Promise<T>): Promise<T | undefined> {
  if (!(await ensureSaved())) return undefined;
  return fn();
}

export async function switchProject(id: string): Promise<void> {
  if (projects.active?.id === id) return;
  await guardThen(async () => {
    projects.loading = true;
    try {
      await setActiveProject(await api.activateProject(id));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PROJECT_UNAVAILABLE') {
        const choice = await choose({
          title: 'Project not found',
          message: `${e.message}\n\nThe folder may have been moved, renamed or deleted.`,
          buttons: [
            { label: 'Cancel', value: 'cancel' },
            { label: 'Remove from List', value: 'remove', variant: 'danger' },
            { label: 'Locate…', value: 'locate', variant: 'primary' }
          ]
        });
        if (choice === 'locate') await locateProject(id);
        if (choice === 'remove') await removeProjectFromList(id, true);
      } else showError(e);
      await refreshProjects();
    } finally {
      projects.loading = false;
    }
  });
}

export async function createProject(): Promise<void> {
  const name = await prompt({
    title: 'New Project',
    message: 'Enter a name. You will then choose where the project folder is created.',
    placeholder: 'My Notes',
    okLabel: 'Choose Location…',
    validate: (v) => nameProblem(v.trim())
  });
  if (!name) return;
  await guardThen(async () => {
    try {
      const p = await api.createProject(name.trim());
      if (p) {
        await setActiveProject(p);
        toast(`Project "${p.name}" created`, 'success');
      }
    } catch (e) {
      showError(e);
    }
  });
}

export async function openFolderAsProject(): Promise<void> {
  await guardThen(async () => {
    try {
      const p = await api.openFolderAsProject();
      if (p) await setActiveProject(p);
    } catch (e) {
      showError(e);
    }
  });
}

export async function renameProject(id: string): Promise<void> {
  const current = projects.list.find((p) => p.id === id);
  const name = await prompt({
    title: 'Rename Project',
    message: 'This changes the display name. The folder on disk is not renamed.',
    value: current?.name ?? '',
    okLabel: 'Rename',
    validate: (v) => (v.trim() ? null : 'Name cannot be empty.')
  });
  if (!name) return;
  try {
    const p = await api.renameProject(id, name.trim());
    if (projects.active?.id === id) projects.active.name = p.name;
    await refreshProjects();
  } catch (e) {
    showError(e);
  }
}

export async function removeProjectFromList(id: string, skipConfirm = false): Promise<void> {
  const p = projects.list.find((x) => x.id === id);
  if (
    !skipConfirm &&
    !(await confirm({
      title: 'Remove from List',
      message: `Remove "${p?.name}" from the project list?\n\nThe folder and its files stay on disk:\n${p?.path}`,
      okLabel: 'Remove'
    }))
  )
    return;
  if (projects.active?.id === id && !(await ensureSaved())) return;
  try {
    await api.removeProjectFromList(id);
    if (projects.active?.id === id) {
      closeDoc();
      projects.active = null;
      tree.root = null;
    }
    await refreshProjects();
  } catch (e) {
    showError(e);
  }
}

export async function deleteProject(id: string): Promise<void> {
  const p = projects.list.find((x) => x.id === id);
  if (!p) return;
  const typed = await prompt({
    title: 'Delete Project',
    message: `This moves the whole project folder to the Recycle Bin:\n${p.path}\n\nType the project name "${p.name}" to confirm.`,
    okLabel: 'Delete Project',
    danger: true,
    validate: (v) => (v === p.name ? null : 'Type the project name exactly.')
  });
  if (typed !== p.name) return;
  try {
    if (projects.active?.id === id) {
      autosave.cancel();
      closeDoc();
      projects.active = null;
      tree.root = null;
    }
    await api.deleteProject(id);
    toast(`"${p.name}" moved to the Recycle Bin`, 'success');
    await refreshProjects();
  } catch (e) {
    showError(e);
  }
}

export async function locateProject(id: string): Promise<void> {
  try {
    const p = await api.locateProject(id);
    if (p) await setActiveProject(p);
  } catch (e) {
    showError(e);
  }
}

// =================================================================== file operations

export async function newFile(dir = ''): Promise<void> {
  const id = activeId();
  if (!id) return;
  const name = await prompt({
    title: 'New File',
    message: dir ? `In "${dir}". ".md" is added if no extension is given.` : '".md" is added if no extension is given.',
    placeholder: 'notes',
    okLabel: 'Create',
    validate: (v) => nameProblem(v.trim())
  });
  if (!name) return;
  try {
    const rel = await api.createFile(id, dir, name.trim());
    if (dir) tree.expanded.add(dir);
    await refreshTree();
    await openFile(rel);
  } catch (e) {
    showError(e);
  }
}

export async function newFolder(dir = ''): Promise<void> {
  const id = activeId();
  if (!id) return;
  const name = await prompt({
    title: 'New Folder',
    message: dir ? `In "${dir}".` : undefined,
    placeholder: 'folder',
    okLabel: 'Create',
    validate: (v) => nameProblem(v.trim())
  });
  if (!name) return;
  try {
    const rel = await api.createDir(id, dir, name.trim());
    if (dir) tree.expanded.add(dir);
    tree.expanded.add(rel);
    persistMeta();
    await refreshTree();
  } catch (e) {
    showError(e);
  }
}

/** Applies a path change (rename/move) to open doc, recents and expanded folders. */
async function afterRelocate(from: string, to: string): Promise<void> {
  const p = projects.active;
  if (p) p.recentFiles = p.recentFiles.map((r) => remap(r, from, to));
  const exp = [...tree.expanded];
  tree.expanded.clear();
  for (const e of exp) tree.expanded.add(remap(e, from, to));
  if (tree.selected) tree.selected = remap(tree.selected, from, to);
  await refreshTree();
  if (doc.path && isWithin(doc.path, from)) {
    const newPath = remap(doc.path, from, to);
    if (doc.path === from) {
      // The file itself moved: reload (image links may have been rewritten).
      await openFile(newPath, { force: true });
    } else {
      doc.path = newPath;
    }
  }
  persistMeta();
}

async function guardIfAffectsDoc(path: string): Promise<boolean> {
  if (doc.path && isWithin(doc.path, path)) return ensureSavedStrict();
  return true;
}

/** Like ensureSaved, but always saves (never discards) when autosave is off. */
async function ensureSavedStrict(): Promise<boolean> {
  if (!doc.dirty) return true;
  if (settings.autosave) return saveNow();
  const ok = await confirm({
    title: 'Save changes first?',
    message: `"${basename(doc.path ?? '')}" has unsaved changes. They must be saved before continuing.`,
    okLabel: 'Save and Continue'
  });
  return ok ? saveNow() : false;
}

export async function commitRename(path: string, newName: string): Promise<void> {
  tree.renaming = null;
  const id = activeId();
  if (!id || !newName || newName === basename(path)) return;
  const problem = nameProblem(newName);
  if (problem) return toast(problem, 'error');
  if (!(await guardIfAffectsDoc(path))) return;
  try {
    const to = await api.renameEntry(id, path, newName);
    await afterRelocate(path, to);
  } catch (e) {
    showError(e);
  }
}

export async function moveEntry(path: string, targetDir: string): Promise<void> {
  const id = activeId();
  if (!id || dirname(path) === targetDir || isWithin(targetDir, path)) return;
  if (!(await guardIfAffectsDoc(path))) return;
  try {
    const to = await api.moveEntry(id, path, targetDir);
    if (targetDir) tree.expanded.add(targetDir);
    await afterRelocate(path, to);
  } catch (e) {
    showError(e);
  }
}

export async function deleteEntry(path: string): Promise<void> {
  const id = activeId();
  if (!id) return;
  try {
    const info = await api.entryInfo(id, path);
    let includeImages = false;
    if (info.imagesDir) {
      const choice = await choose({
        title: 'Delete File',
        message: `Move "${basename(path)}" to the Recycle Bin?\n\nIt has an images folder: "${basename(info.imagesDir)}".`,
        buttons: [
          { label: 'Cancel', value: 'cancel' },
          { label: 'Delete File Only', value: 'file', variant: 'danger' },
          { label: 'Delete File and Images', value: 'both', variant: 'danger' }
        ]
      });
      if (choice !== 'file' && choice !== 'both') return;
      includeImages = choice === 'both';
    } else {
      const what = info.isDir ? 'folder and everything in it' : 'file';
      if (
        !(await confirm({
          title: info.isDir ? 'Delete Folder' : 'Delete File',
          message: `Move the ${what} "${basename(path)}" to the Recycle Bin?`,
          okLabel: 'Delete',
          danger: true
        }))
      )
        return;
    }
    if (doc.path && isWithin(doc.path, path)) closeDoc();
    await api.deleteEntry(id, path, includeImages);
    const p = projects.active;
    if (p) p.recentFiles = p.recentFiles.filter((r) => !isWithin(r, path));
    if (tree.selected && isWithin(tree.selected, path)) tree.selected = null;
    await refreshTree();
    persistMeta();
  } catch (e) {
    showError(e);
  }
}

export async function revealInExplorer(path: string): Promise<void> {
  const id = activeId();
  if (id) await api.revealInExplorer(id, path).catch(showError);
}

export async function copyRelativePath(path: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(path);
    toast('Path copied');
  } catch (e) {
    showError(e);
  }
}

// =================================================================== gitignore

export function ruleCandidates(path: string, isDir: boolean): string[] {
  return isDir ? [`/${path}/`, `${path}/`, `/${path}`, path] : [`/${path}`, path];
}

export function hasExactRule(path: string, isDir: boolean): boolean {
  return ruleCandidates(path, isDir).some((r) => tree.rules.includes(r));
}

export async function addToGitignore(path: string, isDir: boolean): Promise<void> {
  const id = activeId();
  if (!id) return;
  try {
    await api.addIgnoreRule(id, isDir ? `/${path}/` : `/${path}`);
    await refreshTree();
    toast(`Added "${path}" to .gitignore`, 'success');
  } catch (e) {
    showError(e);
  }
}

export async function removeFromGitignore(path: string, isDir: boolean): Promise<void> {
  const id = activeId();
  if (!id) return;
  try {
    for (const r of ruleCandidates(path, isDir)) {
      if (tree.rules.includes(r)) await api.removeIgnoreRule(id, r);
    }
    await refreshTree();
    toast(`Removed "${path}" from .gitignore`, 'success');
  } catch (e) {
    showError(e);
  }
}

// =================================================================== import / export

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export async function exportFile(path: string): Promise<void> {
  const id = activeId();
  if (!id) return;
  if (doc.path === path && !(await ensureSavedStrict())) return;
  try {
    const s = await api.exportFile(id, path);
    if (s) {
      const extra = s.skipped.length ? ` (${s.skipped.length} reference(s) outside the project skipped)` : '';
      toast(`Exported ${s.files} file(s), ${fmtBytes(s.bytes)}${extra}`, 'success');
    }
  } catch (e) {
    showError(e);
  }
}

export async function exportProject(): Promise<void> {
  const id = activeId();
  if (!id) return;
  if (!(await ensureSavedStrict())) return;
  const choice = await choose({
    title: 'Export Project',
    message: 'Export the whole project as a ZIP archive. Should files matched by .gitignore be left out?',
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: 'Include Everything', value: 'all' },
      { label: 'Respect .gitignore', value: 'respect', variant: 'primary' }
    ]
  });
  if (choice !== 'all' && choice !== 'respect') return;
  try {
    const s = await api.exportProject(id, choice === 'respect');
    if (s) toast(`Exported ${s.files} file(s), ${fmtBytes(s.bytes)}`, 'success');
  } catch (e) {
    showError(e);
  }
}

export async function importZipAsProject(): Promise<void> {
  await guardThen(async () => {
    try {
      const s = await api.importZipAsProject();
      if (s?.project) {
        await setActiveProject(s.project);
        toast(`Imported project "${s.project.name}" (${s.files} files)`, 'success');
      }
    } catch (e) {
      showError(e);
    }
  });
}

export async function importIntoProject(dir = ''): Promise<void> {
  const id = activeId();
  if (!id) return;
  try {
    const s = await api.importIntoProject(id, dir);
    if (!s) return;
    if (dir) tree.expanded.add(dir);
    await refreshTree();
    for (const w of s.warnings) toast(w);
    toast(`Imported ${s.files} file(s)`, 'success');
    if (s.targetPath && fileKind(s.targetPath) === 'markdown' && findNode(s.targetPath)?.type === 'file') {
      await openFile(s.targetPath);
    }
  } catch (e) {
    showError(e);
  }
}

// =================================================================== images

export async function insertImagesFromDialog(): Promise<string[]> {
  const id = activeId();
  if (!id || !doc.path) return [];
  try {
    const links = await api.pickAndImportImages(id, doc.path);
    if (links.length) void refreshTree();
    return links;
  } catch (e) {
    showError(e);
    return [];
  }
}

// =================================================================== external changes

export async function onExternalChange(): Promise<void> {
  const id = activeId();
  if (!id) return;
  await refreshTree();
  const path = doc.path;
  if (!path || doc.kind === 'image') return;
  if (!findNode(path)) {
    toast(`"${basename(path)}" was moved or deleted outside the app.`, 'error');
    if (!doc.dirty) closeDoc();
    return;
  }
  try {
    const disk = await api.readFile(id, path);
    if (doc.path !== path || disk === doc.savedContent) return;
    if (!doc.dirty) {
      loadDoc(path, doc.kind, disk);
      toast(`"${basename(path)}" was updated on disk and reloaded.`);
    } else {
      toast(`"${basename(path)}" changed on disk.`, 'info', {
        label: 'Reload',
        run: () => loadDoc(path, doc.kind, disk)
      });
    }
  } catch {
    /* ignore transient read errors */
  }
}

// =================================================================== startup / shutdown

export async function init(): Promise<void> {
  try {
    settings.cfg = await api.getConfig();
  } catch (e) {
    showError(e);
  }
  applyTheme();
  const cfg = settings.cfg;
  if (cfg) {
    ui.sidebarWidth = cfg.sidebar.width;
    ui.sidebarCollapsed = cfg.sidebar.collapsed;
    ui.viewMode = cfg.defaultViewMode;
  }
  window.api.onFsChanged((pid) => {
    if (pid === activeId()) void onExternalChange();
  });
  window.api.onCloseRequested(async () => {
    let ok = await ensureSaved();
    if (!ok && doc.dirty && doc.saveError) {
      // Saving keeps failing (e.g. folder removed): don't trap the user.
      ok = await confirm({
        title: 'Could not save',
        message: `"${basename(doc.path ?? '')}" could not be saved:\n${doc.saveError}\n\nClose anyway and lose the unsaved changes?`,
        okLabel: 'Close Without Saving',
        danger: true
      });
    }
    if (ok) {
      persistMeta.flush();
      await api.confirmClose();
    }
  });
  window.addEventListener('blur', () => {
    if (settings.autosave && doc.dirty) void saveNow();
  });
  await refreshProjects();
  const activeIdCfg = cfg?.activeProjectId;
  const entry = projects.list.find((p) => p.id === activeIdCfg);
  if (entry?.available) {
    try {
      await setActiveProject(await api.activateProject(entry.id));
    } catch (e) {
      showError(e);
    }
  }
  ui.ready = true;
}

export { join };
