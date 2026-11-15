# Architecture

## 1. Overview

An **Electron** desktop app built from three isolated parts:

- **Renderer (Svelte + TS):** all UI, Markdown rendering and the editor. It has **no Node or filesystem access** (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`).
- **Preload:** a thin bridge. It exposes one typed `window.api` object through `contextBridge`. Each method is one `ipcRenderer.invoke` call.
- **Main process (Node + TS):** owns every filesystem, ZIP, dialog and metadata operation. It checks every path it receives.

```
┌──────────────────────────── Renderer (Svelte + TS, sandboxed) ─────────────────────────────┐
│  Components              Stores                  Services                                   │
│  Sidebar/ProjectSwitcher projects/settings       api.ts  (typed wrapper over window.api)   │
│  FileTree / TreeNode     projects                markdown/ (marked+hljs+DOMPurify+mermaid) │
│  EditorPane              fileTree                editor/   (CodeMirror setup, paste)       │
│  PreviewPane             document                links/    (resolve + click routing)       │
│  GitignorePanel          ui                                                                 │
│  Dialogs / Toasts                                                                           │
└───────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                        │ window.api.*  (contextBridge)
┌───────────────────────────────────────▼─────── Preload ─────────────────────────────────────┐
│  ipcRenderer.invoke(channel, args)  ·  ipcRenderer.on('fs-changed')                         │
└───────────────────────────────────────┬─────────────────────────────────────────────────────┘
                                        │ IPC (ipcMain.handle)          mdimg:// protocol (images)
┌───────────────────────────────────────▼─────── Main process (Node + TS) ────────────────────┐
│  ipc/ (handlers: validate args → call service → map errors)                                 │
│  services/  projectRegistry  project  fsOps  images  gitignore  archive  watcher            │
│  core/      pathGuard (all paths)   config (%APPDATA%)   errors   atomicWrite               │
│  window.ts  (BrowserWindow, CSP, navigation lock, protocol registration)                    │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
                                        │
                               Real filesystem
```

### Design principles
1. **Separation of concerns:** components display data, stores hold state, services hold logic, and the main process does I/O.
2. **The disk is the source of truth:** the tree is reloaded from disk after each change.
3. **Security at the boundary:** the renderer only sends *project-relative* paths. Absolute paths (for import or export) come only from dialogs **opened by the main process itself**, never from the renderer.
4. **Portable data:** Markdown always uses relative links, and project metadata lives inside the project folder.

---

## 2. Data Model

### Project model
**A project is a single root folder** that the user creates or opens, and it can be anywhere on disk. Everything inside it (including subfolders) belongs to that project. Subfolders are **never** projects. The app keeps a *registry* of known project roots in its config.

### On-disk layout (one project)
```
D:/Notes/My Notes/                    ← project root (chosen by the user)
├── .mdviewer/
│   └── project.json                  ← project metadata (travels with export)
├── .gitignore
├── intro.md
├── intro-images/                     ← pasted images for intro.md
│   └── image-20261115-142301.png
└── guides/                           ← ordinary subfolder
    ├── setup.md
    └── setup-images/
```

### `project.json`
```json
{
  "schemaVersion": 1,
  "id": "uuid-v4",
  "name": "My Notes",
  "description": "",
  "createdAt": "2026-11-15T14:00:00Z",
  "updatedAt": "2026-11-15T14:20:00Z",
  "lastOpenFile": "guides/setup.md",
  "recentFiles": ["guides/setup.md", "intro.md"],
  "expandedFolders": ["guides"],
  "settings": { "viewMode": "split" }
}
```

### App config: `app.getPath('userData')/config.json` (`%APPDATA%/Simple Markdown/`)
```json
{
  "schemaVersion": 1,
  "projects": [
    { "id": "uuid-1", "name": "My Notes", "path": "D:/Notes/My Notes", "lastOpenedAt": "2026-11-15T14:20:00Z" },
    { "id": "uuid-2", "name": "Work Docs", "path": "E:/Work/docs",     "lastOpenedAt": "2026-11-14T09:00:00Z" }
  ],
  "activeProjectId": "uuid-1",
  "theme": "system",
  "autosave": { "enabled": true, "delayMs": 1000 },
  "sidebar": { "width": 280, "collapsed": false },
  "window": { "width": 1280, "height": 800, "maximized": false }
}
```
- `projects[].path` is the **only** place absolute paths are stored. Everything else is relative to the project root.
- The renderer refers to projects by `id`. Main looks up the root path and never trusts a path sent by the renderer.

---

## 3. Main Process Modules

| Module | Responsibility |
|---|---|
| `core/pathGuard.ts` | `resolveInProject(projectRoot, relPath)`: rejects absolute paths, drive or UNC prefixes, `..` that escapes the root, NUL bytes, reserved Windows names (`CON`, `NUL`, `COM1`…) and invalid characters. Then checks `realpath(result)` starts with `realpath(projectRoot)`, which catches symlink or junction escapes. Every service uses this. |
| `core/atomicWrite.ts` | Write to `file.tmp-<rand>`, then `fs.rename`. Used for Markdown, metadata and config. |
| `core/errors.ts` | `AppError { code, message }` with codes: `PATH_OUTSIDE_ROOT`, `NOT_FOUND`, `ALREADY_EXISTS`, `INVALID_NAME`, `ZIP_INVALID`, `ZIP_LIMIT`, `IO`, `CANCELLED`. |
| `core/config.ts` | Load and save the app config. Migrates by `schemaVersion`. |
| `services/project.ts` (registry part) | The project list in config: add, remove from list, set active, `getProjectRoot(projectId)`, availability check (does the folder still exist?), *Locate…* (re-point a moved project). |
| `services/project.ts` | Create a new project (parent dialog + name → folder + `project.json`), open a folder as a project (adds metadata if missing), rename (display name), delete (whole root to the Recycle Bin via `shell.trashItem`). Read and patch `project.json`. |
| `services/fsOps.ts` | `listTree`, `readFile`, `writeFile`, `createFile`, `createDir`, `rename`, `move`, `delete`. Uses `images.ts` for the `-images` folder. |
| `services/images.ts` | `savePastedImage(mdPath, bytes, ext)`, `importImageFile(mdPath)` (opens its own dialog), `imagesDirFor(mdPath)`, `rewriteImageLinks(content, oldDir, newDir)`. |
| `services/gitignore.ts` | Parse `.gitignore` into lines (keeping comments), add/remove rules, presets, `getIgnored(paths)` via the `ignore` package. |
| `services/archive.ts` | `exportFile`, `exportProject`, `importZipAsProject`, `importIntoProject`. Uses yazl (write) and yauzl (read with validation, see §6). |
| `services/watcher.ts` | (Phase 13) `fs.watch` on the active project (recursive, debounced). Sends `fs-changed` to the renderer. Ignores the app's own writes. |
| `protocol.ts` | Registers the `mdimg://` scheme (`mdimg://<projectId>/<rel path>`). It serves image files **only** from inside the active project root and only with image MIME types. |
| `window.ts` | Creates the BrowserWindow with secure `webPreferences`, a CSP header, `setWindowOpenHandler` → deny, and a `will-navigate` block. Saves and restores the window bounds. |
| `ipc/index.ts` | One typed handler map covering every method in `shared/api.ts`. Each handler checks the argument types and the sender (`event.senderFrame` must be the app's own URL), opens any native dialog itself, calls the service, and returns a result or a serialised `AppError`. |
| `core/trash.ts` | Delete strategy. In the app it is `shell.trashItem` (Recycle Bin). In tests it removes items directly. |

### IPC contract (exposed as `window.api`)

```ts
// config / settings
getConfig(): Config
updateSettings(patch: Partial<Settings>): Config      // autosave on/off + delay, theme, sidebar

// projects: `project` below always means projectId
listProjects(): ProjectSummary[]                      // includes `available: boolean`
createProject(name, description?): ProjectMeta | null // main opens the "choose parent folder" dialog
openFolderAsProject(): ProjectMeta | null             // main opens the folder dialog
activateProject(projectId): ProjectMeta
renameProject(projectId, newName): ProjectMeta
removeProjectFromList(projectId): void                // files untouched
deleteProject(projectId): void                        // root → Recycle Bin
locateProject(projectId): ProjectMeta | null          // re-point a moved folder
updateProjectMeta(projectId, patch): ProjectMeta      // lastOpenFile, recentFiles, expandedFolders, viewMode

// files: all paths project-relative, '/'-separated
listTree(project): TreeNode
readFile(project, path): string
writeFile(project, path, content): void
createFile(project, dir, name): string
createDir(project, dir, name): string
renameEntry(project, path, newName): string
moveEntry(project, path, targetDir): string
deleteEntry(project, path, includeImages: boolean): void

// images
savePastedImage(project, mdPath, bytes: ArrayBuffer, ext): string   // returns relative link
importImageFiles(project, mdPath, droppedNames?): string[]

// gitignore
getGitignore(project): GitignoreLine[]
setGitignore(project, lines): void
addIgnoreRule(project, pattern): void
removeIgnoreRule(project, pattern): void
getIgnored(project): string[]
gitignorePresets(): Preset[]

// archive: main opens the save/open dialogs itself
exportFile(project, mdPath): ExportSummary | null
exportProject(project, respectGitignore): ExportSummary | null
importZipAsProject(): ImportSummary | null                          // dialogs: pick ZIP, then parent folder
importIntoProject(project, targetDir): ImportSummary | null          // .zip or .md

// events
onFsChanged(cb): unsubscribe
```

> **Dropped files:** in a sandboxed renderer, `webUtils.getPathForFile(file)` (exposed through preload) returns the absolute path of a file dragged in from Explorer. Main accepts it only for an image-copy action, only if it is an existing regular file with an image extension, and **copies** it (the source is never modified).

---

## 4. Renderer Modules

```
src/renderer/
├── index.html                                ← strict CSP
└── src/
    ├── main.ts  App.svelte  env.d.ts         ← layout shell + global shortcuts
    ├── styles/  app.css (theme tokens)  markdown.css (preview)
    ├── lib/
    │   ├── api.ts            ← typed Proxy over window.api + ApiError
    │   ├── state.svelte.ts   ← Svelte 5 rune state: settings, projects, tree, doc, ui
    │   ├── actions.ts        ← all app logic: open/save/autosave, projects, file ops, gitignore, import/export
    │   ├── dialogs.ts        ← promise-based prompt/choose/confirm, toasts, context menu
    │   ├── scrollSync.ts     ← editor ↔ preview scroll sync
    │   ├── markdown/ renderer.ts  mermaid.ts  links.ts
    │   ├── editor/   setup.ts (CodeMirror, paste/drop)  ref.ts
    │   └── util/     debounce.ts  paths.ts  names.ts
    └── components/
    Sidebar (resizable, collapsible)
      ├─ ProjectSwitcher      ← top: active project + dropdown list, New / Open folder
      ├─ RecentFiles          ← last 10 files in this project
      └─ FileTree / TreeNode  ← the whole project, click a file to open it
    ContextMenu
    EditorPane  PreviewPane  ViewModeToggle
    StatusBar (save state · autosave toggle · view mode)
    GitignorePanel  ImportExportDialog  SettingsDialog
    common/ Dialog  Prompt  Confirm  Toast
```

### UI layout (no tabs)
```
┌──────────────────────┬──────────────────────────────────────────────┐
│ ▾ My Notes        ⚙  │  guides/setup.md ●        [Edit|Split|Preview]│
│──────────────────────│──────────────────────┬───────────────────────│
│ RECENT               │                      │                       │
│   setup.md           │   CodeMirror editor  │    Live preview       │
│   intro.md           │                      │                       │
│──────────────────────│                      │                       │
│ FILES        + 📁 ⟳  │                      │                       │
│ ▾ guides             │                      │                       │
│     setup.md  ◀ open │                      │                       │
│   intro.md           │                      │                       │
│   .gitignore         │                      │                       │
├──────────────────────┴──────────────────────┴───────────────────────┤
│ ✓ Saved · Autosave: On ⏻ · Split · UTF-8                            │
└─────────────────────────────────────────────────────────────────────┘
```
One editor area. The sidebar tree is how you get to any file at any time. `●` marks unsaved changes (shown only when autosave is off, or during the 1 s autosave delay).

Shared types (`src/shared/types.ts`) are imported by the main, preload and renderer code, so both sides of IPC use the same types.

---

## 5. Key Flows

### 5.1 Open & edit a file (sidebar navigation)
1. Click a file in `FileTree` or `RecentFiles` → `document.open(path)`.
2. If the current file is dirty:
   - **Autosave on:** flush the pending save straight away, then continue.
   - **Autosave off:** show *Save / Don't Save / Cancel*.
3. `api.readFile`, then the store updates, CodeMirror loads the content, the tree highlights the file, and `recentFiles` / `lastOpenFile` are updated.
4. Each change sets the dirty flag and updates the preview (debounced at ~150 ms).

### 5.1a Saving & autosave
- `settings.autosave.enabled` (default **true**) and `delayMs` (default **1000**). Toggled in Settings or with the status-bar toggle, which takes effect immediately.
- **On:** a debounced `api.writeFile` runs after typing stops. Pending saves are flushed on file switch, project switch, window blur and app close.
- **Off:** only Ctrl+S saves. The dirty dot shows in the sidebar and title. Switching or closing asks first.
- Every write is atomic in main. If a save fails, a toast appears and the file stays dirty.

### 5.2 Paste image
1. The CodeMirror `paste` handler finds an `image/*` item in `clipboardData`.
2. The renderer reads it as an `ArrayBuffer` and calls `api.savePastedImage(project, mdPath, buf, 'png')`.
3. Main checks the size limit (e.g. 25 MB) and the magic bytes, creates `<dir>/<stem>-images/`, writes `image-YYYYMMDD-HHMMSS[-n].png`, and returns `./<stem>-images/<file>.png` (URL-encoded).
4. The renderer inserts `![image](./<stem>-images/<file>.png)` at the cursor.

### 5.3 Rendering local images
- The renderer resolves a relative `src` against the current file's folder to get a project-relative path, then rewrites the DOM `src` to `mdimg://<projectId>/<encoded rel path>`.
- The main protocol handler runs `pathGuard`, checks it is an image extension, and streams the file.
- The Markdown source is never changed. The CSP allows `img-src 'self' mdimg: data: https:`.

### 5.4 Rename/move an `.md` file
1. Rename `a.md` to `b.md` (or move it to `sub/`).
2. If `a-images/` exists, it is renamed or moved to `b-images/` next to the target.
3. Links in `b.md` that start with `./a-images/` or `a-images/` are rewritten to `./b-images/` and the file is saved atomically.
4. If any step fails, the earlier steps are undone and an error is returned.

### 5.5 Export / Import
- **Export:** main shows the save dialog, walks the files (optionally applying gitignore), and streams them into yazl with forward-slash relative names, including `.mdviewer/project.json`.
- **Import as a new project:** main shows the open-ZIP dialog, then the choose-parent-folder dialog. **Pass 1** reads every yauzl entry header and rejects the whole archive on any violation (see §6). **Pass 2** extracts into `<parent>/.mdviewer-tmp-<uuid>/`, counting the real bytes written. Then `fs.rename` moves it to `<parent>/<name>/`, a new project id is assigned, and the project is added to the registry. If anything fails, the temp folder is deleted.
- **Import into the current project:** same validation, extracted into a temp folder inside the project root and then moved into the chosen subfolder.

---

## 6. Security Model

| Threat | Mitigation |
|---|---|
| Renderer compromise reaching Node | `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webSecurity: true`. Preload exposes only the named API functions, never `ipcRenderer` itself. |
| Path traversal from the UI | `pathGuard.resolveInProject` on every path, plus a `realpath` prefix check (catches junctions and symlinks). |
| Renderer supplying arbitrary absolute paths | Not allowed. Import/export paths come only from dialogs that main opens. Dropped-file paths are copy-only and limited to images. |
| Zip-slip (`../x`, `C:\x`, `/x`, `\\server\x`) | Reject entries with an absolute or drive or UNC prefix, a `..` segment after normalising, a backslash, a NUL byte, or a reserved name. Re-check that `path.resolve(tmp, entry)` starts with `tmp + sep`. |
| Symlinks in ZIP | Reject entries whose external attributes mark a symlink. |
| Zip bomb | Limits: total uncompressed ≤ 500 MB, entries ≤ 10,000, per-entry ratio ≤ 100:1. Bytes actually written are counted while streaming (headers are not trusted). |
| XSS from Markdown | DOMPurify on rendered HTML. Mermaid `securityLevel: 'strict'`. Strict CSP: `default-src 'self'; script-src 'self'; img-src 'self' mdimg: data: https:; style-src 'self' 'unsafe-inline'`. |
| Malicious links | Every navigation is intercepted. `http`, `https` and `mailto` go to `shell.openExternal`. Relative `.md` links are handled in the app. Everything else is blocked. `window.open` is denied. |
| Spoofed IPC sender | Handlers check that `event.senderFrame.url` is the app's own origin. |
| Data loss | Atomic writes, Recycle Bin deletes, unsaved-changes warnings (including on window close), transactional import. |

---

## 7. Error Handling
- Main: services throw `AppError`. IPC handlers catch errors and return `{ ok: false, error: { code, message } }` or `{ ok: true, data }`.
- Renderer: `api.ts` unwraps the result, throws a typed error, and the stores show a toast. Components never touch `window.api` directly.

## 8. Testing Strategy
- **Vitest (Node env), 91 tests:** `pathGuard` traversal cases (including junction escape), `rewriteImageLinks`, pasted/dropped image handling, file operations with images-folder rollback, gitignore round trip and matching, projects and registry, and archive export/import round trip. Malicious ZIPs (zip-slip, absolute paths, drive letters, backslashes, reserved names, ADS, symlinks, encrypted entries, duplicates, bombs, lying headers, entry and size limits) are built byte by byte by `tests/helpers/zipBuilder.ts`.
- **Vitest (jsdom env), 10 tests:** the Markdown renderer (GFM output, sanitising, heading ids, Mermaid placeholders), link classification, image rewriting, path helpers.
- **End-to-end smoke test** (`npm run smoke`): Playwright's Electron driver launches the built app against a temporary project. It checks project restore, rendering (tables, tasks, hljs, Mermaid, images), autosave on and off, the unsaved-changes prompt, image paste, view modes, new file, rename with images folder and link rewrite, gitignore from the context menu, theme switching, settings persistence, and the renderer's lack of Node access. It also saves screenshots.

## 9. Repository Layout

```
simple-markdown/
├── Architecture.md  Features.md  Step by Step Plan.md  Technology Suggestion.md  requirement.md  README.md
├── package.json  electron.vite.config.ts  tsconfig*.json  svelte.config.mjs  electron-builder.yml  vitest.config.ts
├── build-portable.bat                ← double-click to build the portable .exe
├── build/                            ← icon.ico / icon.png (generated by scripts/make-icon.mjs)
├── src/
│   ├── main/
│   │   ├── index.ts  window.ts  protocol.ts
│   │   ├── core/      pathGuard.ts  atomicWrite.ts  errors.ts  config.ts  trash.ts
│   │   ├── services/  project.ts (incl. registry)  fsOps.ts  images.ts  gitignore.ts  archive.ts  watcher.ts
│   │   └── ipc/       index.ts
│   ├── preload/
│   │   └── index.ts                  ← contextBridge.exposeInMainWorld('api', …)
│   ├── renderer/                     ← see §4
│   └── shared/
│       ├── api.ts                    ← IPC contract (ApiMethods) + allow-list
│       └── types.ts                  ← data types used by all three
├── tests/
│   ├── helpers/  (temp dirs, raw ZIP builder for malicious archives)
│   ├── main/     pathGuard images fsOps gitignore project archive
│   └── renderer/ markdown (GFM, sanitising, links)
├── scripts/  build-portable.ps1  smoke-test.mjs  make-icon.mjs
└── samples/
    └── gfm-showcase.md
```

The project registry turned out small enough to live inside `services/project.ts` instead of a separate `projectRegistry.ts`.
