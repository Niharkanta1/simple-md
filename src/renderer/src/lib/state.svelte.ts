import { SvelteSet } from 'svelte/reactivity';
import type { AppConfig, OpenProject, ProjectSummary, SearchResponse, TreeNode, ViewMode } from '../../../shared/types';
import type { FileKind } from './util/paths';

// ------------------------------------------------------------------ settings

class SettingsState {
  cfg = $state<AppConfig | null>(null);
  get autosave(): boolean {
    return this.cfg?.autosave.enabled ?? true;
  }
  get autosaveDelay(): number {
    return this.cfg?.autosave.delayMs ?? 1000;
  }
}
export const settings = new SettingsState();

// ------------------------------------------------------------------ projects

class ProjectsState {
  list = $state<ProjectSummary[]>([]);
  active = $state<OpenProject | null>(null);
  loading = $state(false);
}
export const projects = new ProjectsState();

// ------------------------------------------------------------------ tree

/** dataTransfer type used when dragging tree entries. */
export const DRAG_TYPE = 'application/x-mdv-path';

class TreeState {
  root = $state<TreeNode | null>(null);
  expanded = new SvelteSet<string>();
  ignored = new SvelteSet<string>();
  rules = $state<string[]>([]);
  selected = $state<string | null>(null);
  renaming = $state<string | null>(null);
  dropTarget = $state<string | null>(null);
}
export const tree = new TreeState();

// ------------------------------------------------------------------ document

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

class DocState {
  path = $state<string | null>(null);
  kind = $state<FileKind | null>(null);
  /** Current editor text (kept in sync by the editor). */
  content = $state('');
  /** Increments every time a new document is loaded into the editor. */
  loadToken = $state(0);
  version = $state(0);
  savedVersion = $state(0);
  saving = $state(false);
  saveError = $state<string | null>(null);
  /** Content as last written to / read from disk. */
  savedContent = '';

  get dirty(): boolean {
    return this.version !== this.savedVersion;
  }
  get saveState(): SaveState {
    if (this.saving) return 'saving';
    if (this.saveError && this.dirty) return 'error';
    return this.dirty ? 'dirty' : 'saved';
  }
}
export const doc = new DocState();

// ------------------------------------------------------------------ ui

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  message: string;
  action?: { label: string; run: () => void };
}

export interface MenuItem {
  label?: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  run?: () => void;
}

export type DialogRequest =
  | {
      kind: 'prompt';
      title: string;
      message?: string;
      value: string;
      placeholder?: string;
      okLabel: string;
      danger?: boolean;
      selectStem?: boolean;
      validate?: (v: string) => string | null;
      resolve: (v: string | null) => void;
    }
  | {
      kind: 'choice';
      title: string;
      message: string;
      buttons: { label: string; value: string; variant?: 'primary' | 'danger' | 'default' }[];
      resolve: (v: string | null) => void;
    };

class UiState {
  viewMode = $state<ViewMode>('split');
  sidebarWidth = $state(280);
  sidebarCollapsed = $state(false);
  toasts = $state<Toast[]>([]);
  dialog = $state<DialogRequest | null>(null);
  menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);
  gitignoreOpen = $state(false);
  settingsOpen = $state(false);
  quickOpen = $state(false);
  /** Sidebar shows the project search panel instead of the file tree. */
  searchOpen = $state(false);
  shortcutsOpen = $state(false);
  resolvedTheme = $state<'light' | 'dark'>('light');
  ready = $state(false);
}
export const ui = new UiState();

// ------------------------------------------------------------------ search

class SearchState {
  /** Committed search tokens, shown as chips. */
  tokens = $state<string[]>([]);
  /** Text currently typed in the search box (not yet a token). */
  draft = $state('');
  response = $state<SearchResponse | null>(null);
  busy = $state(false);
  error = $state<string | null>(null);
  /** Bumped to ask the search box to take focus. */
  focusToken = $state(0);
}
export const search = new SearchState();
