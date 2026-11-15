import type {
  AppConfig,
  EntryInfo,
  ExportSummary,
  GitignoreData,
  GitignorePreset,
  ImportSummary,
  OpenProject,
  ProjectMetaPatch,
  ProjectSummary,
  SettingsPatch,
  TreeNode
} from './types';

/**
 * The full IPC contract. Every method is exposed to the renderer through the
 * preload bridge as `window.api.invoke(name, ...args)`. Paths are always
 * project-relative ('/'-separated); `projectId` identifies the project.
 */
export interface ApiMethods {
  // settings / app
  getConfig(): AppConfig;
  updateSettings(patch: SettingsPatch): AppConfig;
  openExternal(url: string): void;
  confirmClose(): void;

  // projects
  listProjects(): ProjectSummary[];
  createProject(name: string): OpenProject | null;
  openFolderAsProject(): OpenProject | null;
  activateProject(projectId: string): OpenProject;
  renameProject(projectId: string, newName: string): OpenProject;
  removeProjectFromList(projectId: string): void;
  deleteProject(projectId: string): void;
  locateProject(projectId: string): OpenProject | null;
  updateProjectMeta(projectId: string, patch: ProjectMetaPatch): OpenProject;

  // files
  listTree(projectId: string): TreeNode;
  readFile(projectId: string, path: string): string;
  writeFile(projectId: string, path: string, content: string): void;
  createFile(projectId: string, dir: string, name: string): string;
  createDir(projectId: string, dir: string, name: string): string;
  renameEntry(projectId: string, path: string, newName: string): string;
  moveEntry(projectId: string, path: string, targetDir: string): string;
  deleteEntry(projectId: string, path: string, includeImages: boolean): void;
  entryInfo(projectId: string, path: string): EntryInfo;
  revealInExplorer(projectId: string, path: string): void;

  // images
  savePastedImage(projectId: string, mdPath: string, bytes: Uint8Array, ext: string): string;
  importDroppedImages(projectId: string, mdPath: string, absPaths: string[]): string[];
  pickAndImportImages(projectId: string, mdPath: string): string[];

  // gitignore
  getGitignore(projectId: string): GitignoreData;
  setGitignore(projectId: string, content: string): GitignoreData;
  addIgnoreRule(projectId: string, pattern: string): GitignoreData;
  removeIgnoreRule(projectId: string, pattern: string): GitignoreData;
  getIgnored(projectId: string): string[];
  gitignorePresets(): GitignorePreset[];

  // import / export
  exportFile(projectId: string, mdPath: string): ExportSummary | null;
  exportProject(projectId: string, respectGitignore: boolean): ExportSummary | null;
  importZipAsProject(): ImportSummary | null;
  importIntoProject(projectId: string, targetDir: string): ImportSummary | null;
}

export type ApiMethodName = keyof ApiMethods;

export const API_METHODS: ApiMethodName[] = [
  'getConfig',
  'updateSettings',
  'openExternal',
  'confirmClose',
  'listProjects',
  'createProject',
  'openFolderAsProject',
  'activateProject',
  'renameProject',
  'removeProjectFromList',
  'deleteProject',
  'locateProject',
  'updateProjectMeta',
  'listTree',
  'readFile',
  'writeFile',
  'createFile',
  'createDir',
  'renameEntry',
  'moveEntry',
  'deleteEntry',
  'entryInfo',
  'revealInExplorer',
  'savePastedImage',
  'importDroppedImages',
  'pickAndImportImages',
  'getGitignore',
  'setGitignore',
  'addIgnoreRule',
  'removeIgnoreRule',
  'getIgnored',
  'gitignorePresets',
  'exportFile',
  'exportProject',
  'importZipAsProject',
  'importIntoProject'
];

/** Events pushed from main to renderer. */
export const EVENTS = {
  fsChanged: 'event:fs-changed',
  closeRequested: 'event:close-requested'
} as const;

/** What the preload exposes as `window.api`. */
export interface BridgeApi {
  invoke(method: ApiMethodName, ...args: unknown[]): Promise<unknown>;
  onFsChanged(cb: (projectId: string) => void): () => void;
  onCloseRequested(cb: () => void): () => void;
  getPathForFile(file: File): string;
}
