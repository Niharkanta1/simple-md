// Types shared by main, preload and renderer.

export type ViewMode = 'editor' | 'split' | 'preview';
export type ThemeSetting = 'system' | 'light' | 'dark';

export interface ProjectEntry {
  id: string;
  name: string;
  path: string; // absolute root folder
  lastOpenedAt: string;
}

export interface AppSettings {
  theme: ThemeSetting;
  autosave: { enabled: boolean; delayMs: number };
  sidebar: { width: number; collapsed: boolean };
  defaultViewMode: ViewMode;
}

export interface AppConfig extends AppSettings {
  schemaVersion: 1;
  projects: ProjectEntry[];
  activeProjectId: string | null;
  window: { width: number; height: number; x?: number; y?: number; maximized: boolean };
}

export type SettingsPatch = {
  theme?: ThemeSetting;
  autosave?: Partial<AppSettings['autosave']>;
  sidebar?: Partial<AppSettings['sidebar']>;
  defaultViewMode?: ViewMode;
};

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  available: boolean;
  lastOpenedAt: string;
}

export interface ProjectMeta {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  lastOpenFile: string | null;
  recentFiles: string[];
  expandedFolders: string[];
  settings: { viewMode: ViewMode | null };
}

/** ProjectMeta plus runtime info the renderer needs. */
export interface OpenProject extends ProjectMeta {
  rootPath: string;
}

export type ProjectMetaPatch = Partial<
  Pick<ProjectMeta, 'description' | 'lastOpenFile' | 'recentFiles' | 'expandedFolders' | 'settings'>
>;

export interface TreeNode {
  name: string;
  /** Project-relative path using '/' separators. '' for the root. */
  path: string;
  type: 'file' | 'dir';
  children?: TreeNode[];
}

export interface EntryInfo {
  exists: boolean;
  isDir: boolean;
  /** Project-relative path of the companion `<stem>-images` folder, if it exists. */
  imagesDir: string | null;
}

export interface GitignoreData {
  exists: boolean;
  content: string;
  rules: string[];
}

export interface GitignorePreset {
  id: string;
  label: string;
  patterns: string[];
}

export interface ExportSummary {
  zipPath: string;
  files: number;
  bytes: number;
  skipped: string[];
}

export interface ImportSummary {
  files: number;
  bytes: number;
  /** For import into a project: project-relative folder/file that was created. */
  targetPath?: string;
  /** For import as a new project. */
  project?: OpenProject;
  warnings: string[];
}

export type ErrorCode =
  | 'PATH_OUTSIDE_ROOT'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'INVALID_NAME'
  | 'INVALID_ARGUMENT'
  | 'PROJECT_UNAVAILABLE'
  | 'ZIP_INVALID'
  | 'ZIP_LIMIT'
  | 'TOO_LARGE'
  | 'FORBIDDEN'
  | 'IO';

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
}

export type Envelope<T> = { ok: true; data: T } | { ok: false; error: ErrorPayload };

export interface SearchSnippet {
  /** 1-based line number. */
  line: number;
  text: string;
}

export interface SearchHit {
  /** Project-relative path. */
  path: string;
  score: number;
  /** Total token occurrences in the content. */
  matches: number;
  /** Occurrences in the content per (lower-cased) token. */
  tokenCounts: Record<string, number>;
  snippets: SearchSnippet[];
}

export interface SearchResponse {
  /** The tokens the query was split into. */
  tokens: string[];
  results: SearchHit[];
  /** Number of documents that were searched. */
  searched: number;
  /** True if more documents matched than were returned. */
  truncated: boolean;
}
