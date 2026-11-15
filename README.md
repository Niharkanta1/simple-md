# Simple Markdown

A lightweight desktop Markdown editor, viewer and project manager for Windows, built with Electron, Svelte 5 and TypeScript.

- **Projects:** a project is any folder you create or open. Switch between projects from the sidebar.
- **File management:** create, rename, move (drag-and-drop), delete (to the Recycle Bin) and reveal files and folders. Everything happens on the real filesystem.
- **Editor and preview:** CodeMirror editor with Editor, Split and Preview modes. GitHub Flavored Markdown: tables, task lists, strikethrough, autolinks, syntax-highlighted code, blockquotes and **Mermaid** diagrams.
- **Images:** paste a screenshot with **Ctrl+V**, or drop or insert image files. They are saved to `<file>-images/` next to the note and linked with a relative path. Renaming or moving a note moves its images folder too and updates the links.
- **Links:** web links open in your browser. Relative `.md` links open in the app. `#anchors` scroll the preview.
- **.gitignore manager:** add or remove rules, apply common presets, use *Add to .gitignore* from the tree's right-click menu, or edit the file directly. Ignored items appear dimmed in the tree.
- **Import and export:** export a file (with its images) or a whole project as a ZIP. Import a ZIP as a new project, or import `.md` / `.zip` files into a folder. Imports are checked against zip-slip, absolute paths, symlinks and zip bombs.
- **Autosave** is on by default, with a 1 s delay. Toggle it from the status bar or Settings. When autosave is off, the app asks *Save / Don't Save / Cancel* before you switch files or close.
- Light and dark themes (follows Windows by default), resizable and collapsible sidebar, recent files, quick open.

## Quick start (development)

Requirements: **Node.js 20+**. Nothing else needs to be installed system-wide.

```bash
npm install
npm run dev
```

## Build a portable Windows executable

Double-click **`build-portable.bat`**, or run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-portable.ps1          # tests + type check + portable .exe
powershell -ExecutionPolicy Bypass -File scripts\build-portable.ps1 -Zip     # also an unzip-and-run .zip
powershell -ExecutionPolicy Bypass -File scripts\build-portable.ps1 -SkipChecks
```

Output in `release\`:

| File | What it is |
|---|---|
| `SimpleMarkdown-<version>-portable.exe` | A single file. Copy it anywhere and run it. No installation needed. |
| `SimpleMarkdown-<version>-x64.zip` | An unzip-and-run folder (with `-Zip`). Starts faster than the single exe. |

The npm equivalents are `npm run dist:portable`, `npm run dist:zip` and `npm run dist`.

> The executable is not code-signed, so Windows SmartScreen may show "Windows protected your PC" on first launch. Click **More info → Run anyway**.

### Where settings are stored

- By default, settings are stored in `%APPDATA%\Simple Markdown\config.json`. This file holds the project list, theme, autosave and window size.
- **Portable mode:** create a folder named `SimpleMarkdown-data` next to the portable `.exe`. Settings are then kept there, so the app runs fully from a USB drive.
- Each project's own metadata is stored inside the project, in `.mdviewer/project.json`. It is included in exports.

## Keyboard shortcuts

| Keys | Action |
|---|---|
| Ctrl+S | Save |
| Ctrl+N | New file (in the selected folder) |
| Ctrl+P | Quick open |
| Ctrl+1 / 2 / 3 | Editor / Split / Preview |
| Ctrl+B | Toggle sidebar |
| Ctrl+F | Find in editor |
| Ctrl+V | Paste image |
| F2 / Del | Rename / delete the selected tree item |
| Ctrl+, | Settings |

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Run with hot reload |
| `npm run build` | Compile to `out/` |
| `npm test` | Unit tests (Vitest): path guard, file operations, images, gitignore, projects, ZIP security, Markdown rendering |
| `npm run typecheck` | `tsc` (main/preload) and `svelte-check` (renderer) |
| `npm run smoke` | Build, then drive the real app end to end with Playwright (about 40 checks plus screenshots in `out/smoke/`) |
| `npm run icon` | Regenerate `build/icon.png` and `build/icon.ico` |

## Project layout

```
src/
  main/        Electron main process: all filesystem, ZIP and dialog work
    core/      pathGuard, atomicWrite, config, errors, trash
    services/  project, fsOps, images, gitignore, archive, watcher
    ipc/       typed IPC handlers (argument and sender validation)
    protocol.ts  mdimg:// image protocol (project-scoped)
    window.ts    secure BrowserWindow (sandbox, CSP, navigation lock)
  preload/     contextBridge → window.api (allow-listed methods only)
  renderer/    Svelte 5 UI
    src/lib/   state, actions, markdown (marked + hljs + DOMPurify + mermaid), editor (CodeMirror)
    src/components/
  shared/      IPC contract and types shared by all three
tests/         Vitest suites + malicious-ZIP builder
scripts/       build-portable.ps1, smoke-test.mjs, make-icon.mjs
samples/       gfm-showcase.md
```

See [Architecture.md](Architecture.md), [Features.md](Features.md), [Step by Step Plan.md](Step%20by%20Step%20Plan.md) and [Technology Suggestion.md](Technology%20Suggestion.md) for the design.

## Troubleshooting

- **The app opens as a Node process or exits with "Cannot read properties of undefined (reading 'registerSchemesAsPrivileged')"** when started from some tools: the environment variable `ELECTRON_RUN_AS_NODE` is set (VS Code's extension host sets it). Clear it with `Remove-Item Env:ELECTRON_RUN_AS_NODE` in PowerShell or `set ELECTRON_RUN_AS_NODE=` in cmd. The build script already does this.
- **The build fails with "Cannot create symbolic link : A required privilege is not held by the client":** this is a known electron-builder problem on Windows without admin rights or Developer Mode. `build-portable.ps1` avoids it by running `scripts/prepare-wincodesign.mjs` first. If you call `electron-builder` directly, run `node scripts/prepare-wincodesign.mjs` once beforehand.
- **A project shows "(missing)":** its folder was moved or renamed outside the app. Select it and choose **Locate…**.
