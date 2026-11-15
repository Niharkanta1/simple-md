# Step-by-Step Implementation Plan

Stack: **Electron + electron-vite + Svelte 5 + TypeScript** (see `Technology Suggestion.md`). Only `npm install` is needed. Nothing is installed system-wide.

Each phase ends with a **Verify** gate. We don't move to the next phase until every check passes (Vitest green, plus the manual checklist done in the running app).

---

## Phase 0 — Scaffold
- `npm init`, add electron, electron-vite, Svelte 5, TypeScript, Vitest, ESLint/Prettier.
- Folder structure from Architecture §9: `main/`, `preload/`, `renderer/`, `shared/`.
- Secure `BrowserWindow` (sandbox, contextIsolation, CSP, navigation lock, window-open deny).
- Layout shell: sidebar, main area, status bar. Light/dark CSS variables.
- Check that no dependency builds native code (`npm ls`, no `node-gyp` in the install log).

**Verify:** `npm run dev` opens the window with hot reload. `npm test` runs. In DevTools, `window.require` and `process` are undefined in the renderer.

---

## Phase 1 — Core: Path Guard, Errors, Config, IPC Plumbing
- `core/errors.ts`, `core/atomicWrite.ts`, `core/pathGuard.ts` + **thorough tests** (`..`, absolute paths, `C:\`, UNC, reserved names, mixed slashes, junction/symlink escape).
- `core/config.ts`: load and save in `userData`.
- IPC pattern: `ipc/index.ts` registration, sender validation, `{ok,data|error}` envelope, preload `window.api`, renderer `api.ts`, toast system.

**Verify:** all pathGuard tests pass. `config.json` appears in `%APPDATA%/Simple Markdown/` and survives a restart. A forced error in main shows as a toast.

---

## Phase 2 — Projects (PM-1…PM-8)
- `projectRegistry.ts` (the project list in config) and `project.ts` (create in a chosen parent, open a folder as a project, rename, remove from list, delete to the Recycle Bin, locate).
- Sidebar shell (resizable, collapsible) with `ProjectSwitcher` at the top. Mark unavailable projects.
- Restore the active project and window bounds on launch.

**Verify:** create a project in `D:\Temp\A` and open the existing folder `D:\Temp\B` as a project. Both show `.mdviewer/project.json`, and subfolders are **not** listed as projects. Switch between them, restart, and the last one reopens. "Remove from list" leaves the folder on disk. "Delete" sends it to the Recycle Bin. Rename a folder in Explorer and the project shows as unavailable, and Locate… fixes it.

---

## Phase 3 — Sidebar File Tree & File Operations (FM-1…FM-8, ED-13…ED-15)
- `listTree`, `createFile`, `createDir`, `renameEntry`, `moveEntry`, `deleteEntry` (Recycle Bin).
- `FileTree` / `TreeNode` in the sidebar: expand/collapse (remembered per project), active-file highlight, context menu, inline rename, drag-and-drop move.
- `RecentFiles` section (P1).
- Name validation on both sides. Reveal in Explorer (`shell.showItemInFolder`).

**Verify:** create, rename, move and delete nested files and folders, and confirm each matches Explorer. `CON`, `a:b` and duplicates are rejected. Dragging a folder into its own child is blocked.

---

## Phase 4 — Editor & Saving (ED-1, ED-7, ED-8)
- CodeMirror 6 with Markdown, line wrapping, search, and a theme.
- Click a file in the sidebar to open it in the single editor area (no tabs).
- `document` store: open, dirty tracking, Ctrl+S.
- **Autosave: on by default (1 s debounce).** On/off toggle in the status bar and in Settings. Delay setting. Saved to config.
- Autosave on: flush on file/project switch, window blur and close. Autosave off: *Save / Don't Save / Cancel* prompt on switch and close (main `close` event).
- Remember `lastOpenFile` and `recentFiles` per project.

**Verify:**
- Autosave **on**: type, wait 1 s, and Notepad shows the change. Switch files straight after typing and nothing is lost.
- Autosave **off**: the dirty dot appears. Switching files prompts. Closing the app prompts. Ctrl+S saves.
- The toggle setting survives a restart. Typing in a 1 MB file stays smooth.

---

## Phase 5 — Preview & View Modes (ED-2…ED-5, ED-9, ED-10)
- `markdown/renderer.ts`: marked (GFM) + highlight.js + DOMPurify.
- `PreviewPane` (GitHub-like CSS). Editor / Preview / Split toggle (Ctrl+1/2/3). Scroll sync (P1).
- Create `samples/gfm-showcase.md`.

**Verify:** the showcase renders tables, task lists, strikethrough, autolinks, blockquotes, nested lists and code in 3+ languages. Vitest: `<script>` and `onerror` are stripped. Mode switching is instant.

---

## Phase 6 — Mermaid (ED-6)
- Dynamic `import('mermaid')` only when a mermaid block exists. `securityLevel: 'strict'`. Theme-aware.
- Show an inline error box for invalid diagrams.

**Verify:** flowchart, sequence and class diagrams render. A broken diagram shows an error and the rest of the preview still works. Startup time doesn't change when no mermaid blocks are present.

---

## Phase 7 — Links & Image Rendering (IL-1, IL-6, IL-7)
- `mdimg://` protocol in main (pathGuard + image MIME types only).
- Renderer rewrites relative image `src` values to `mdimg://`.
- Link routing: http/https/mailto go to `shell.openExternal`, relative `.md` links open in the app, `#anchor` links scroll, everything else is blocked.

**Verify:** `./x-images/a.png` and `../assets/b.jpg` render. A path outside the project (`../../../Windows/win.ini`) is refused by the protocol. An external link opens in the browser. A `javascript:` link does nothing.

---

## Phase 8 — Paste & Drop Images (IL-2…IL-5)
- `savePastedImage` (size limit, magic-byte check, unique timestamped name).
- Drop handler: `webUtils.getPathForFile`, then main copies the image in.
- Relative link inserted at the cursor (URL-encode spaces).

**Verify:** paste a screenshot, and the PNG appears in `<name>-images/`, the link is inserted and the preview shows it. Two pastes in the same second give two distinct files. Dropping a JPG copies it in.

---

## Phase 9 — Image-Aware Rename / Move / Delete (FM-3…FM-5, IL-8)
- Rename or move the `-images` folder with its `.md` file. Rewrite links in that file. Roll back on failure.
- Delete offers "also delete images folder".

**Verify:** rename `notes.md` to `ideas.md` and the folder becomes `ideas-images/` with links updated and images still rendering. Move it to a subfolder and everything still renders. Vitest covers the link-rewrite edge cases (spaces, `<…>` links, reference-style links, links inside code blocks left untouched).

---

## Phase 10 — Gitignore Manager (GI-1…GI-6)
- `gitignore.ts`: parse and serialise (keeping comments), add/remove, presets, `getIgnored` via the `ignore` package.
- `GitignorePanel`: list, add/remove, presets, raw edit tab.
- Tree context menu: Add to / Remove from .gitignore. Ignored items greyed out.

**Verify:** add `*.log` and `drafts/`, and the tree greys out matching items. If Git is available, `git check-ignore -v` agrees. Removing a rule updates the file and the tree.

---

## Phase 11 — Export (IE-1…IE-3, IE-8)
- `exportFile` (the md, its images folder and other referenced local images), `exportProject` (optional gitignore filtering) with yazl.
- Save dialog in main, summary dialog in the renderer.

**Verify:** open the ZIPs in Explorer and the structure is correct, `.mdviewer/project.json` is included, and paths use forward slashes.

---

## Phase 12 — Import & ZIP Security (IE-4…IE-8)
- `importZipAsProject` (pick ZIP, then parent folder, then register the project with a new id) and `importIntoProject` (.zip / .md) with yauzl.
- Pass 1 validates all headers, pass 2 extracts to a temp folder while counting bytes, then an atomic rename. Conflict naming (`Name (2)`).
- Test fixtures generated in the test setup: zip-slip, absolute path, `C:\`, backslash names, symlink entry, zip bomb, 20k entries.

**Verify:** every malicious fixture is rejected and **nothing is written** outside the temp folder (which is then removed). Export a project, import it, compare SHA-256 hashes, and all files are identical. Images render after import.

---

## Phase 13 — Polish & Packaging
- External change detection (`fs.watch`, recursive, debounced) (FM-9).
- Settings dialog (theme, autosave). Shortcuts overview. Quick-open with Ctrl+P (P2).
- Performance pass: startup time, a project with 5k files (lazy tree loading if needed).
- `electron-builder` NSIS installer + app icon. Check that the installer size is around 80–100 MB.

**Verify:** install the build, run it on a fresh profile, and do a full manual regression pass over every phase's checklist.

---

## Implementation Status (v1.0.0)

| Phase | Status | Verified by |
|---|---|---|
| 0 Scaffold | ✅ | build, `window.require`/`process` undefined (smoke) |
| 1 Core | ✅ | `pathGuard.test.ts` (33 tests, including junction escape) |
| 2 Projects | ✅ | `project.test.ts`, smoke [1] |
| 3 Sidebar & file ops | ✅ | `fsOps.test.ts`, smoke [7] |
| 4 Editor, save, autosave | ✅ | smoke [3] and [5] (autosave on/off, Ctrl+S, unsaved prompt) |
| 5 Preview & view modes | ✅ | `markdown.test.ts`, smoke [2] and [6] |
| 6 Mermaid | ✅ | smoke [2] and [5] (flowchart, sequence and class diagrams) |
| 7 Links & images | ✅ | `markdown.test.ts`, smoke [2] (mdimg:// blocks paths outside the project) |
| 8 Paste/drop images | ✅ | `images.test.ts`, smoke [4] |
| 9 Image-aware rename/move/delete | ✅ | `fsOps.test.ts`, smoke [7] |
| 10 Gitignore manager | ✅ | `gitignore.test.ts`, smoke [8] |
| 11 Export | ✅ | `archive.test.ts` |
| 12 Import & ZIP security | ✅ | `archive.test.ts` (round trip with identical hashes, 14 malicious archives) |
| 13 Polish & packaging | ✅ | watcher, settings, quick open, themes, `build-portable.bat` producing a portable .exe |

Deferred P2 items: formatting toolbar (ED-11), toggling task checkboxes from the preview (ED-12), finding orphaned images (IL-9), and fixing links in *other* files after a move.

## Milestones

| Milestone | Phases | Outcome |
|---|---|---|
| M1 — Usable editor | 0–5 | Projects, files, editor, live GFM preview |
| M2 — Rich content | 6–9 | Mermaid, images, paste, portable image folders |
| M3 — Project tooling | 10–12 | Gitignore manager, safe import/export |
| M4 — Release | 13 | Polished, packaged v1 |

## Confirmed Decisions
1. **Shell:** Electron + TypeScript only. No system installs (Rust needs the MSVC linker, which isn't available).
2. **Project model:** a project is **one root folder** the user creates or opens, anywhere on disk. Subfolders are ordinary folders, not projects. The app keeps a list of projects.
3. **Navigation:** no tabs. The **left sidebar** (project switcher, recent files, file tree) opens any file at any time in a single editor area.
4. **Delete:** always to the **Recycle Bin**.
5. **Autosave:** **on by default** (1 s). It can be turned off in Settings or the status bar, and the delay can be changed.
