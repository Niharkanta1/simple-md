# Features

Priority key: **P0** = needed for v1 · **P1** = should have in v1 · **P2** = later / nice to have

---

## 1. Project Management

> **Project = a root folder.** A project is one folder anywhere on disk that the user picks or creates. Every subfolder inside it is an ordinary folder, **not** a project. The app keeps a list of known projects.

| ID | Feature | Priority |
|---|---|---|
| PM-1 | **Create a new project:** choose a parent location with the native folder picker and enter a name. The app creates `<parent>/<name>/` with `.mdviewer/project.json`. | P0 |
| PM-2 | **Open a folder as a project:** pick any existing folder. If `.mdviewer/project.json` is missing, it is created. | P0 |
| PM-3 | **Project list:** every known project's root path is stored in the app config. The project switcher sits at the top of the left sidebar. | P0 |
| PM-4 | **Switch projects** with one click. Each project's last open file and expanded tree folders are restored. On launch, the last active project reopens. | P0 |
| PM-5 | **Rename a project.** This changes the display name in `project.json`. The folder on disk stays where it is. | P0 |
| PM-6 | **Remove from list** (files are kept on disk) or **Delete project** (the whole folder goes to the Recycle Bin after the user types the project name to confirm). | P0 |
| PM-7 | **Missing project detection:** if a project folder was moved or deleted outside the app, it is marked "unavailable", with options to *Locate…* or *Remove from list*. | P1 |
| PM-8 | Project metadata includes id, name, description, created/updated timestamps, last open file, expanded folders, and per-project view mode. | P0 |

**Acceptance:** create one project and open another existing folder, then switch between them. After a restart the last project and file reopen. The project folders exist on disk exactly where they were chosen.

---

## 2. File Management

| ID | Feature | Priority |
|---|---|---|
| FM-1 | File tree for the active project in the left sidebar: the project root at the top, folders first, sorted A–Z, can expand and collapse. | P0 |
| FM-2 | Create a Markdown file or folder (context menu and toolbar). `.md` is added to the name automatically. | P0 |
| FM-3 | Rename a file or folder inline. If an `.md` file is renamed, its `<name>-images` folder is renamed too and image links in the file are updated. | P0 |
| FM-4 | Delete a file or folder (with confirmation, sent to the Recycle Bin). Deleting an `.md` file offers to delete its images folder as well. | P0 |
| FM-5 | Move by drag-and-drop in the tree, or with "Move to…". An `.md` file and its images folder move together. | P0 |
| FM-6 | Name validation: no invalid Windows characters, no reserved names (`CON`, `NUL`…), no duplicates. | P0 |
| FM-7 | Show non-`.md` files (images, etc.) in a muted style. Hide `.mdviewer/` and `.git/`. | P1 |
| FM-8 | Reveal in File Explorer. Copy relative path. | P1 |
| FM-9 | Detect changes made outside the app (file watcher) and refresh the tree or the open file. | P2 |
| FM-10 | Quick-open a file by name (Ctrl+P). | P2 |

**Acceptance:** every action in the tree matches the real filesystem right away and is visible in File Explorer.

---

## 3. Markdown Editor & Viewer

| ID | Feature | Priority |
|---|---|---|
| ED-1 | CodeMirror editor with Markdown syntax highlighting, line wrapping, undo/redo and search (Ctrl+F). | P0 |
| ED-2 | Three view modes: **Editor**, **Preview**, **Split** (toggle buttons, and Ctrl+1/2/3). | P0 |
| ED-3 | Live preview, updated as you type (debounced at ~150 ms). | P0 |
| ED-4 | GFM: tables, task lists (checkboxes), strikethrough, autolinks, fenced code, blockquotes, headings, lists. | P0 |
| ED-5 | Code highlighting in fenced blocks, based on the language tag. | P0 |
| ED-6 | Mermaid diagrams render from ```` ```mermaid ```` blocks. Errors show inline. | P0 |
| ED-7 | **Autosave is on by default** (saves 1 s after typing stops). It can be **turned off** in Settings or with the status-bar toggle, and the delay can be changed. Ctrl+S always saves. | P0 |
| ED-7a | **Autosave off:** an unsaved dot shows next to the file name in the sidebar and title bar until you save. | P0 |
| ED-8 | Switching file or project, or closing the app: with **autosave on**, pending changes are saved first. With **autosave off**, you're asked to Save, Don't Save, or Cancel. | P0 |
| ED-9 | Scroll sync between editor and preview in Split mode. | P1 |
| ED-10 | Light and dark themes (follow the OS by default). | P1 |
| ED-11 | Formatting toolbar and shortcuts (bold, italic, link, code, heading). | P2 |
| ED-12 | Clicking a task-list checkbox in the preview toggles it in the source. | P2 |
| ED-13 | **No tabs. The left sidebar is the navigator.** Click any file in the sidebar tree to open it in the single editor area at any time. The active file is highlighted in the tree. | P0 |
| ED-14 | A **Recent files** section in the sidebar (last 10 files in this project) for quick jumping. | P1 |
| ED-15 | The sidebar can be resized and collapsed (Ctrl+B). Its width is remembered. | P1 |

**Acceptance:** a sample GFM document (`samples/gfm-showcase.md`) renders correctly, including a table, task list, code in 3+ languages, a blockquote and a Mermaid flowchart.

---

## 4. Images & Links

| ID | Feature | Priority |
|---|---|---|
| IL-1 | Images with relative paths (`./notes-images/a.png`, `../assets/b.jpg`) show in the preview. | P0 |
| IL-2 | **Paste an image** (Ctrl+V of a screenshot or copied image) into the editor. | P0 |
| IL-3 | A pasted image is saved to `<filename>-images/` next to the `.md` file, named `image-YYYYMMDD-HHMMSS[-n].png`. | P0 |
| IL-4 | `![image](./<filename>-images/<image>.png)` is inserted at the cursor (relative path, forward slashes, URL-encoded spaces). | P0 |
| IL-5 | Drag-and-drop image files into the editor. They are copied into the images folder the same way. | P1 |
| IL-6 | External links (`http/https/mailto`) open in the default browser. | P0 |
| IL-7 | Relative links to other `.md` files open that file in the app. `#anchor` links scroll within the preview. | P0 |
| IL-8 | Images stay portable: links are always relative. Rename and move keep the images folder in sync (see FM-3/FM-5). Export includes the images. | P0 |
| IL-9 | "Find orphaned images" (files in `*-images/` that no Markdown file references). | P2 |

**Acceptance:** paste a screenshot, then export the project, import it on a different path, and the image still renders.

---

## 5. Gitignore Manager

| ID | Feature | Priority |
|---|---|---|
| GI-1 | Panel showing the project's `.gitignore` as a list of rules. Comments and blank lines are kept. | P0 |
| GI-2 | Add or remove rules in the panel. Changes are written straight to `.gitignore` (created if missing). | P0 |
| GI-3 | Right-click a file or folder in the tree and choose **Add to .gitignore** (or **Remove from .gitignore** if a rule matches it exactly). | P0 |
| GI-4 | Common pattern presets: OS files (`.DS_Store`, `Thumbs.db`), editors (`.vscode/`, `.idea/`), `node_modules/`, `*.log`, `*.tmp`, build output, `.env`. | P0 |
| GI-5 | Ignored files show greyed out in the tree, using real gitignore matching. | P1 |
| GI-6 | A raw text edit mode for advanced users. | P1 |

**Acceptance:** rules written by the app give the same result as `git check-ignore` for the same paths.

---

## 6. Import & Export

| ID | Feature | Priority |
|---|---|---|
| IE-1 | **Export a single file** as ZIP: the `.md` plus its `<name>-images/` folder, plus any other local images it references inside the project (paths kept the same). | P0 |
| IE-2 | **Export a project** as ZIP: the full folder tree, including `.mdviewer/project.json` and `.gitignore`. | P0 |
| IE-3 | Export option: leave out files matched by `.gitignore`. | P1 |
| IE-4 | **Import a ZIP as a new project:** choose the ZIP, then choose a parent folder. It is extracted to `<parent>/<name>/` and added to the project list. Existing `.mdviewer/project.json` is reused (with a new id), otherwise metadata is created. Folder name conflicts are resolved (`Name (2)`). | P0 |
| IE-5 | **Import a ZIP or `.md` file into the current project** (into a chosen folder). | P0 |
| IE-6 | **ZIP validation:** reject absolute paths, `..` segments, drive letters, symlinks, and entries that end up outside the target. Limit total uncompressed size (default 500 MB), entry count (10,000), and compression ratio (zip-bomb guard). | P0 |
| IE-7 | Import is atomic: extract to a temporary folder, validate, then move into place. On failure nothing is left behind. | P0 |
| IE-8 | Import/export summary dialog (files, size, warnings such as skipped entries). | P1 |

**Acceptance:** a set of malicious test ZIPs (zip-slip, absolute paths, bomb) are all rejected. A round trip (export, then import) produces byte-identical files.

---

## 7. General / Non-functional

- Cold start under 1.5 s. Opening a 1 MB Markdown file stays responsive.
- Every backend file operation is limited to the active project's root folder (see Architecture §6).
- Clear error messages (toast notifications). Nothing fails silently.
- Keyboard-friendly: shortcuts for save, view modes, new file, quick-open.
- App settings stored in the OS app-data folder. Project metadata stored inside each project.

## 8. Out of Scope (v1)

- Git commit/push/pull (only `.gitignore` is managed)
- Cloud sync or collaboration
- Exporting to PDF or HTML
- Plugins or extensions
- Automatically fixing links in *other* files when a file is moved (planned for P2)
