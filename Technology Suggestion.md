# Technology Suggestion

## 0. Constraint

**No new system installs.** Available on the machine: Node.js, Java, Rust (no MSVC C++ Build Tools).

So:
- **Tauri is ruled out.** Rust on Windows needs the MSVC linker (C++ Build Tools).
- **No npm packages with native addons** (anything that runs `node-gyp` or compiles C/C++ on install). Every dependency must be pure JavaScript or ship prebuilt binaries through npm.
- Everything comes in through `npm install` into the project folder. Nothing is installed system-wide.

## 1. Summary

| Layer | Recommendation | Why |
|---|---|---|
| Desktop shell | **Electron** (current stable) | Needs only Node. It is downloaded as an npm dev dependency. Mature, well documented, bundles Chromium so rendering is the same everywhere. |
| Language | **TypeScript** everywhere (main, preload, renderer) | One language. Types are shared across the IPC boundary. |
| Build tool | **electron-vite** | One Vite config for the main, preload and renderer bundles. Fast HMR. |
| Frontend framework | **Svelte 5** | Compiles away with almost no runtime and little boilerplate. |
| Editor | **CodeMirror 6** (`@codemirror/lang-markdown`) | Lightweight, modular, good paste hooks, handles large files well. |
| Markdown parser | **marked** (GFM mode) | Small and fast. GFM tables, task lists, strikethrough and autolinks are built in. |
| Syntax highlighting | **highlight.js** (common subset) + `marked-highlight` | Small and easy to theme. |
| Diagrams | **mermaid** (lazy-loaded) | Loaded only when a document has a Mermaid block. |
| HTML sanitizing | **DOMPurify** | Blocks XSS from Markdown or HTML content. |
| ZIP read | **yauzl** | Pure JS, streaming. Lets us check entries and limits *before* and *during* extraction. |
| ZIP write | **yazl** | Pure JS, streaming, same author as yauzl. |
| .gitignore matching | **ignore** (npm) | Pure JS, follows the gitignore spec. |
| Safe delete | `shell.trashItem()` | **Built into Electron.** Sends items to the Recycle Bin. No dependency. |
| File watching | `fs.watch(dir, { recursive: true })` | **Built into Node.** Recursive watching is supported on Windows. No dependency. |
| UUIDs | `crypto.randomUUID()` | Built into Node. |
| Dialogs, external links | Electron `dialog`, `shell.openExternal()` | Built in. |
| Packaging | **electron-builder** (NSIS installer) | npm package. It downloads its own NSIS tooling into a cache, so no system install. |
| Testing | **Vitest** (unit + main-process logic). Playwright for Electron (optional, later). | Pure npm. |

## 2. What we're giving up compared with Tauri

| | Electron | Tauri |
|---|---|---|
| Installer size | ~80–100 MB | ~5–10 MB |
| Idle RAM | ~150–250 MB | ~40–80 MB |
| Setup on this machine | `npm install` only ✅ | Needs C++ Build Tools ❌ |

This is fine for a Markdown editor. Startup and typing speed will still be fast. To keep the app light we'll lazy-load Mermaid, keep the dependency count low, and avoid a UI component library.

## 3. Why these frontend choices

- **Svelte instead of React:** no virtual-DOM runtime, and the UI is small (tree, editor, preview, dialogs).
- **CodeMirror 6 instead of Monaco:** about 10× smaller, and its Markdown support is first-class.
- **marked instead of remark/unified:** GFM works without a plugin tree.
- **No UI kit:** plain CSS with CSS variables for light and dark themes.

## 4. Dependency budget

**Runtime (shipped):**
`svelte`, `@codemirror/{state,view,commands,search,language,lang-markdown,language-data}`, `marked`, `marked-highlight`, `highlight.js`, `dompurify`, `mermaid`, `yauzl`, `yazl`, `ignore`

**Dev only:**
`electron`, `electron-vite`, `vite`, `@sveltejs/vite-plugin-svelte`, `typescript`, `vitest`, `electron-builder`, `eslint`, `prettier`, matching `@types/*`

**Rules:**
1. Anything Electron or Node already provides (trash, watch, uuid, dialogs, paths) uses the built-in version.
2. No packages with native addons. Check with `npm ls` and by watching for `node-gyp` in the install output.
3. Each new dependency needs a written reason in this file.

## 5. Prerequisites

- Node.js 20+ (already installed) ✅
- Nothing else. Java and Rust are not used.
