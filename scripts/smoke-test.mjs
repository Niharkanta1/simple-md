// End-to-end smoke test: launches the BUILT app (out/) with Playwright's
// Electron driver against a throw-away project and exercises the main flows.
// Usage: npm run smoke   (builds first)
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const shots = process.env.SMOKE_SHOTS ?? path.join(repo, 'out', 'smoke');

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

let failures = 0;
function check(cond, label) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 8000, step = 100) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if (await fn()) return true;
    } catch {
      /* retry */
    }
    await sleep(step);
  }
  return false;
}

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'mdv-smoke-'));
const userData = path.join(tmp, 'userData');
const root = path.join(tmp, 'Smoke Project');
await fs.mkdir(path.join(root, '.mdviewer'), { recursive: true });
await fs.mkdir(path.join(root, 'README-images'), { recursive: true });
await fs.mkdir(path.join(root, 'docs'), { recursive: true });
await fs.mkdir(userData, { recursive: true });

const id = crypto.randomUUID();
const now = new Date().toISOString();
await fs.writeFile(
  path.join(root, '.mdviewer', 'project.json'),
  JSON.stringify({
    schemaVersion: 1, id, name: 'Smoke Project', description: '', createdAt: now, updatedAt: now,
    lastOpenFile: 'README.md', recentFiles: ['README.md'], expandedFolders: [], settings: { viewMode: 'split' }
  })
);
await fs.writeFile(path.join(root, 'README-images', 'dot.png'), PNG_1PX);
await fs.copyFile(path.join(repo, 'samples', 'gfm-showcase.md'), path.join(root, 'docs', 'showcase.md'));
await fs.writeFile(
  path.join(root, 'README.md'),
  [
    '# Smoke Test',
    '',
    '| Feature | Status |',
    '|---|---|',
    '| Tables | ok |',
    '',
    '- [x] done',
    '- [ ] todo',
    '',
    '```js',
    'const answer = 42;',
    '```',
    '',
    '```mermaid',
    'graph TD; A-->B;',
    '```',
    '',
    '![dot](./README-images/dot.png)',
    '',
    '[Showcase](docs/showcase.md) · [External](https://example.com) · [Bad](javascript:alert(1))',
    ''
  ].join('\n')
);
await fs.writeFile(
  path.join(userData, 'config.json'),
  JSON.stringify({
    schemaVersion: 1,
    projects: [{ id, name: 'Smoke Project', path: root, lastOpenedAt: now }],
    activeProjectId: id,
    theme: 'light',
    autosave: { enabled: true, delayMs: 500 },
    sidebar: { width: 280, collapsed: false },
    defaultViewMode: 'split',
    window: { width: 1300, height: 820, maximized: false }
  })
);
await fs.mkdir(shots, { recursive: true });

console.log('Launching app…');
const env = { ...process.env, MDV_USER_DATA: userData, MDV_DEBUG_CONSOLE: '1' };
delete env.ELECTRON_RUN_AS_NODE; // set by some hosts (e.g. VS Code); would start Electron as plain Node
const app = await electron.launch({
  args: [path.join(repo, 'out', 'main', 'index.js')],
  cwd: repo,
  env
});
const consoleErrors = [];
app.process().stdout?.on('data', (d) => {
  const s = d.toString();
  if (/\[renderer:(3|error)\]/.test(s) || /Uncaught|TypeError|ReferenceError/.test(s)) consoleErrors.push(s.trim());
});
app.process().stderr?.on('data', (d) => {
  const s = d.toString();
  if (/error/i.test(s) && !/GPU|gpu|DevTools|Autofill/.test(s)) consoleErrors.push(s.trim());
});

const win = await app.firstWindow();
win.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
const readme = path.join(root, 'README.md');

try {
  console.log('\n[1] Startup & project restore');
  check(await waitFor(() => win.locator('.markdown-body table').count().then((n) => n > 0)), 'last project + README reopened, table rendered');
  check((await win.locator('.sidebar .row').count()) >= 3, 'file tree shows entries');
  check(await win.evaluate(() => typeof window.require === 'undefined' && typeof window.process === 'undefined'), 'renderer has no Node access');
  check(await win.evaluate(() => typeof window.api?.invoke === 'function'), 'preload bridge available');

  console.log('\n[2] Preview rendering');
  check((await win.locator('.markdown-body input[type=checkbox]').count()) === 2, 'task list checkboxes');
  check((await win.locator('.markdown-body .hljs-keyword').count()) > 0, 'syntax highlighting');
  check(await waitFor(() => win.locator('.markdown-body .mermaid-block svg').count().then((n) => n > 0), 15000), 'mermaid diagram rendered');
  check(
    await waitFor(() => win.locator('.markdown-body img[alt=dot]').evaluate((img) => img.complete && img.naturalWidth > 0)),
    'relative image loaded via mdimg://'
  );
  check((await win.locator('.markdown-body a[href^="javascript"]').count()) === 0, 'javascript: link sanitised');
  const outside = await win.evaluate(async (pid) => {
    const img = new Image();
    img.src = `mdimg://${pid}/..%2F..%2Fwindows%2Fwin.ini.png`;
    return new Promise((res) => {
      img.onload = () => res('loaded');
      img.onerror = () => res('blocked');
    });
  }, id);
  check(outside === 'blocked', 'mdimg:// refuses paths outside the project');
  await win.screenshot({ path: path.join(shots, '1-split-view.png') });

  console.log('\n[3] Editing & autosave (on)');
  await win.locator('.cm-content').click();
  await win.keyboard.press('Control+End');
  await win.keyboard.type('\nTyped by smoke test.\n');
  check(await waitFor(async () => (await fs.readFile(readme, 'utf8')).includes('Typed by smoke test.'), 5000), 'autosave wrote the change to disk');
  check(await waitFor(() => win.locator('.status .state.saved').count().then((n) => n === 1)), 'status shows Saved');

  console.log('\n[4] Paste image');
  await win.locator('.cm-content').click();
  await win.keyboard.press('Control+End');
  await win.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const file = new File([bytes], 'image.png', { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(file);
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    document.querySelector('.cm-content').dispatchEvent(ev);
  }, PNG_1PX.toString('base64'));
  const pasted = await waitFor(async () => /!\[image\]\(\.\/README-images\/image-\d{8}-\d{6}\.png\)/.test(await fs.readFile(readme, 'utf8')), 6000);
  check(pasted, 'pasted image saved & relative link inserted + autosaved');
  const imgs = await fs.readdir(path.join(root, 'README-images'));
  check(imgs.some((n) => /^image-\d{8}-\d{6}\.png$/.test(n)), 'image file created in README-images/');
  check(
    await waitFor(() => win.locator('.markdown-body img').evaluateAll((els) => els.filter((i) => i.naturalWidth > 0).length >= 2)),
    'pasted image visible in preview'
  );

  console.log('\n[5] Autosave off');
  await win.locator('.status .toggle').click();
  check(await waitFor(() => win.locator('.status .toggle:not(.on)').count().then((n) => n === 1)), 'toggle shows Autosave: Off');
  await win.locator('.cm-content').click();
  await win.keyboard.press('Control+End');
  await win.keyboard.type('Manual save line.');
  await sleep(1200);
  check(!(await fs.readFile(readme, 'utf8')).includes('Manual save line.'), 'not saved automatically');
  check((await win.locator('.toolbar .dirty').count()) === 1, 'unsaved marker visible');
  await win.keyboard.press('Control+s');
  check(await waitFor(async () => (await fs.readFile(readme, 'utf8')).includes('Manual save line.')), 'Ctrl+S saved');
  // Unsaved change then switch file -> prompt
  await win.keyboard.type(' more');
  await win.locator('.sidebar .row', { hasText: 'docs' }).click();
  await win.locator('.sidebar .row', { hasText: 'showcase.md' }).click();
  check(await waitFor(() => win.locator('.dialog', { hasText: 'Unsaved changes' }).count().then((n) => n === 1)), 'switching files asks Save / Don\'t Save / Cancel');
  await win.locator('.dialog button', { hasText: 'Save' }).last().click();
  check(await waitFor(async () => (await fs.readFile(readme, 'utf8')).includes('Manual save line. more')), 'chose Save -> written');
  check(await waitFor(() => win.locator('.toolbar .file', { hasText: 'showcase.md' }).count().then((n) => n === 1)), 'showcase.md opened');
  await win.locator('.status .toggle').click(); // back on
  check(await waitFor(() => win.locator('.markdown-body .mermaid-block svg').count().then((n) => n >= 2), 15000), 'showcase mermaid diagrams render');
  await win.screenshot({ path: path.join(shots, '2-showcase.png') });

  console.log('\n[6] View modes');
  await win.keyboard.press('Control+1');
  check(await waitFor(() => win.locator('.preview-pane').count().then((n) => n === 0)), 'Ctrl+1 editor only');
  await win.keyboard.press('Control+3');
  check(await waitFor(() => win.locator('.editor-pane.hidden').count().then((n) => n === 1)), 'Ctrl+3 preview only');
  await win.keyboard.press('Control+2');
  check(await waitFor(() => win.locator('.panes.split').count().then((n) => n === 1)), 'Ctrl+2 split');

  console.log('\n[7] New file / rename / move via UI');
  await win.locator('.sidebar .files-head button[title^="New File"]').click();
  await win.locator('.dialog input').fill('meeting notes');
  await win.keyboard.press('Enter');
  check(await waitFor(() => fs.access(path.join(root, 'meeting notes.md')).then(() => true)), 'new file created on disk with .md');
  check(await waitFor(() => win.locator('.toolbar .file', { hasText: 'meeting notes.md' }).count().then((n) => n === 1)), 'new file opened');
  // give it an image so rename must carry the folder along
  await fs.mkdir(path.join(root, 'meeting notes-images'));
  await fs.writeFile(path.join(root, 'meeting notes-images', 'a.png'), PNG_1PX);
  await win.locator('.cm-content').click();
  await win.keyboard.press('Control+End');
  await win.keyboard.type('![a](./meeting%20notes-images/a.png)');
  await win.keyboard.press('Control+s');
  await sleep(300);
  await win.locator('.sidebar .row', { hasText: 'meeting notes.md' }).click();
  await win.keyboard.press('F2');
  await win.locator('.sidebar input.rename').fill('minutes.md');
  await win.keyboard.press('Enter');
  check(await waitFor(() => fs.access(path.join(root, 'minutes-images', 'a.png')).then(() => true)), 'rename moved <name>-images folder');
  check(await waitFor(async () => (await fs.readFile(path.join(root, 'minutes.md'), 'utf8')).includes('./minutes-images/a.png')), 'image link rewritten');
  check(await waitFor(() => win.locator('.toolbar .file', { hasText: 'minutes.md' }).count().then((n) => n === 1)), 'renamed file still open');

  console.log('\n[8] .gitignore via context menu');
  await win.locator('.sidebar .row', { hasText: 'minutes.md' }).click({ button: 'right' });
  await win.locator('.menu .item', { hasText: 'Add to .gitignore' }).click();
  check(await waitFor(async () => (await fs.readFile(path.join(root, '.gitignore'), 'utf8')).includes('/minutes.md')), 'rule written to .gitignore');
  check(await waitFor(() => win.locator('.sidebar .row.ignored', { hasText: 'minutes.md' }).count().then((n) => n === 1)), 'ignored file dimmed in tree');

  console.log('\n[9] Theme & settings');
  await win.keyboard.press('Control+Comma');
  await win.locator('.panel .seg button', { hasText: 'Dark' }).click();
  check(await waitFor(() => win.evaluate(() => document.documentElement.dataset.theme === 'dark')), 'dark theme applied');
  await win.keyboard.press('Escape');
  await win.locator('.sidebar .row', { hasText: 'README.md' }).click();
  await waitFor(() => win.locator('.markdown-body .mermaid-block svg').count().then((n) => n > 0), 15000);
  await sleep(400);
  await win.screenshot({ path: path.join(shots, '3-dark.png') });

  console.log('\n[10] Search tokens');
  await win.keyboard.press('Control+Shift+F');
  const searchInput = win.locator('.search .box input');
  check(await waitFor(() => searchInput.evaluate((el) => el === document.activeElement)), 'Ctrl+Shift+F opens search with focus');
  await searchInput.type('smoke');
  await win.keyboard.press('Enter');
  check(await waitFor(() => win.locator('.search .chip', { hasText: 'smoke' }).count().then((n) => n === 1)), 'Enter turns the term into a token chip');
  check(await waitFor(() => win.locator('.search .result .file', { hasText: 'README.md' }).count().then((n) => n === 1)), 'matching document listed');
  await searchInput.type('"const answer"');
  await win.keyboard.press('Enter');
  check(await waitFor(() => win.locator('.search .chip').count().then((n) => n === 2)), 'quoted phrase becomes one token');
  check(await waitFor(() => win.locator('.search .result').count().then((n) => n === 1)), 'only documents with all tokens remain');
  check((await win.locator('.search .snippet mark').count()) > 0, 'snippet highlights tokens');
  await searchInput.type('zzznomatch');
  check(await waitFor(() => win.locator('.search .status', { hasText: 'No documents match' }).count().then((n) => n === 1)), 'live search shows no results for unknown term');
  await win.keyboard.press('Escape'); // clears
  check(await waitFor(() => win.locator('.search .chip').count().then((n) => n === 0)), 'Esc clears the tokens');
  await win.keyboard.press('Escape'); // closes
  check(await waitFor(() => win.locator('.search').count().then((n) => n === 0)), 'Esc again returns to the file tree');
  await win.screenshot({ path: path.join(shots, '4-files-after-search.png') });

  console.log('\n[11] External change prompt');
  const conflict = win.locator('.dialog', { hasText: 'File changed on disk' });
  const before = await fs.readFile(readme, 'utf8');
  await fs.writeFile(readme, before + '\nExternal sync line.\n');
  check(await waitFor(() => conflict.count().then((n) => n === 1)), 'external edit asks Sync / Overwrite');
  await win.screenshot({ path: path.join(shots, '5-external-change.png') });
  await win.locator('.dialog button', { hasText: 'Sync from Disk' }).click();
  check(await waitFor(() => win.locator('.cm-content').innerText().then((t) => t.includes('External sync line.'))), 'Sync loads the disk version');
  const synced = await fs.readFile(readme, 'utf8');
  await fs.writeFile(readme, 'Replaced by another program.\n');
  check(await waitFor(() => conflict.count().then((n) => n === 1)), 'second external edit asks again');
  await win.locator('.dialog button', { hasText: 'Overwrite' }).click();
  check(await waitFor(async () => (await fs.readFile(readme, 'utf8')) === synced), 'Overwrite writes the app content back');
  await sleep(800);
  check((await conflict.count()) === 0, 'own overwrite does not trigger another prompt');
  await fs.writeFile(readme, synced + 'Escape default line.\n');
  check(await waitFor(() => conflict.count().then((n) => n === 1)), 'third external edit asks');
  await win.keyboard.press('Escape');
  check(await waitFor(() => win.locator('.cm-content').innerText().then((t) => t.includes('Escape default line.'))), 'dismissing defaults to Sync');

  console.log('\n[12] Close flow');
  const cfg = JSON.parse(await fs.readFile(path.join(userData, 'config.json'), 'utf8'));
  check(cfg.theme === 'dark' && cfg.autosave.enabled === true, 'settings persisted to config.json');
} catch (e) {
  failures++;
  console.error('Smoke test crashed:', e);
  await win.screenshot({ path: path.join(shots, 'crash.png') }).catch(() => {});
} finally {
  await app.close().catch(() => {});
}

if (consoleErrors.length) {
  console.log('\nRenderer/main errors captured:');
  for (const e of consoleErrors) console.log('  ' + e.slice(0, 400));
}
await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
console.log(`\nScreenshots: ${shots}`);
console.log(failures ? `\nSMOKE TEST FAILED (${failures} check(s))` : '\nSMOKE TEST PASSED');
process.exit(failures ? 1 : 0);
