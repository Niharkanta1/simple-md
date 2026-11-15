// Works around a well-known electron-builder problem on Windows:
// the "winCodeSign" tools archive contains macOS symlinks, and extracting
// symlinks needs admin rights or Developer Mode. The extraction then fails with
// "Cannot create symbolic link : A required privilege is not held by the client".
//
// This script pre-populates electron-builder's cache with the archive
// extracted WITHOUT the darwin/ folder (only the Windows tools — rcedit,
// signtool — are needed). electron-builder then finds the cache and skips its
// own extraction. Nothing is installed system-wide; this only touches
// %LOCALAPPDATA%\electron-builder\Cache (or ELECTRON_BUILDER_CACHE).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const VERSION = 'winCodeSign-2.6.0';
const URL = `https://github.com/electron-userland/electron-builder-binaries/releases/download/${VERSION}/${VERSION}.7z`;
const SIZE = 5635384;

const cacheRoot =
  process.env.ELECTRON_BUILDER_CACHE ||
  path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'electron-builder', 'Cache');
const dir = path.join(cacheRoot, 'winCodeSign');
const target = path.join(dir, VERSION);

if (fs.existsSync(path.join(target, 'rcedit-x64.exe'))) {
  console.log(`winCodeSign already prepared: ${target}`);
  process.exit(0);
}

fs.mkdirSync(dir, { recursive: true });

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'simple-markdown-build' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 5) {
          res.resume();
          resolve(download(res.headers.location, dest, redirects + 1));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on('finish', () => out.close(() => resolve()));
        out.on('error', reject);
      })
      .on('error', reject);
  });
}

// Reuse any archive electron-builder already downloaded (random numeric names).
let archive = fs
  .readdirSync(dir)
  .filter((n) => n.endsWith('.7z'))
  .map((n) => path.join(dir, n))
  .find((p) => fs.statSync(p).size === SIZE);

if (!archive) {
  archive = path.join(dir, `${VERSION}.7z`);
  console.log(`Downloading ${URL} …`);
  await download(URL, archive);
}

const require = createRequire(import.meta.url);
const { path7za } = require('7zip-bin');
const tmp = path.join(dir, `tmp-${process.pid}`);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('Extracting Windows tools (skipping macOS symlinks)…');
execFileSync(path7za, ['x', '-bd', '-y', archive, `-o${tmp}`, '-xr!darwin'], { stdio: 'ignore' });
if (!fs.existsSync(path.join(tmp, 'rcedit-x64.exe'))) {
  throw new Error('Extraction did not produce rcedit-x64.exe');
}
fs.rmSync(target, { recursive: true, force: true });
fs.renameSync(tmp, target);

// Clean up failed partial extractions left by earlier electron-builder runs.
for (const n of fs.readdirSync(dir)) {
  if (/^\d+(\.7z)?$/.test(n)) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
}
console.log(`winCodeSign prepared: ${target}`);
