import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';
import type { ExportSummary, ImportSummary } from '../../shared/types';
import { AppError } from '../core/errors';
import { TMP_SUFFIX } from '../core/atomicWrite';
import { isInside, joinRel, nameProblem, normalizeRel, relDirname, resolveInProject } from '../core/pathGuard';
import { findLocalReferences, imagesDirRel, isImageName, isMarkdownName, stemOf } from './images';
import { loadMatcher } from './gitignore';
import { META_DIR, readMeta, registerImportedProject } from './project';

export interface ZipLimits {
  maxEntries: number;
  maxTotalBytes: number;
  /** Max compression ratio per entry (only checked for entries above ratioMinBytes). */
  maxRatio: number;
  ratioMinBytes: number;
}

export const DEFAULT_LIMITS: ZipLimits = {
  maxEntries: 10000,
  maxTotalBytes: 500 * 1024 * 1024,
  maxRatio: 100,
  ratioMinBytes: 1024 * 1024
};

// ------------------------------------------------------------------ export

interface FileItem {
  abs: string;
  rel: string;
  size: number;
}

function skipForArchive(name: string): boolean {
  return name === '.git' || name.startsWith('.mdviewer-tmp-') || name.endsWith(TMP_SUFFIX);
}

async function collectProjectFiles(root: string, respectGitignore: boolean) {
  const ig = respectGitignore ? await loadMatcher(root) : null;
  const files: FileItem[] = [];
  const emptyDirs: string[] = [];
  const skipped: string[] = [];
  const walk = async (abs: string, rel: string) => {
    const dirents: Dirent[] = await fs.readdir(abs, { withFileTypes: true });
    let kept = 0;
    for (const d of dirents) {
      if (skipForArchive(d.name)) continue;
      const childRel = joinRel(rel, d.name);
      if (d.isSymbolicLink()) {
        skipped.push(childRel);
        continue;
      }
      const isMetaArea = childRel === META_DIR || childRel.startsWith(META_DIR + '/') || childRel === '.gitignore';
      if (ig && !isMetaArea && ig.ignores(d.isDirectory() ? childRel + '/' : childRel)) {
        skipped.push(childRel);
        continue;
      }
      const childAbs = path.join(abs, d.name);
      if (d.isDirectory()) {
        await walk(childAbs, childRel);
        kept++;
      } else if (d.isFile()) {
        files.push({ abs: childAbs, rel: childRel, size: (await fs.stat(childAbs)).size });
        kept++;
      }
    }
    if (kept === 0 && rel !== '') emptyDirs.push(rel);
  };
  await walk(root, '');
  return { files, emptyDirs, skipped };
}

async function writeZip(destAbs: string, files: FileItem[], emptyDirs: string[]): Promise<void> {
  const zip = new yazl.ZipFile();
  for (const f of files) zip.addFile(f.abs, f.rel);
  for (const d of emptyDirs) zip.addEmptyDirectory(d);
  const tmp = `${destAbs}.${crypto.randomBytes(4).toString('hex')}.part`;
  const done = pipeline(zip.outputStream, createWriteStream(tmp));
  zip.end();
  try {
    await done;
    await fs.rename(tmp, destAbs);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

export async function exportProject(root: string, destAbs: string, respectGitignore: boolean): Promise<ExportSummary> {
  const { files, emptyDirs, skipped } = await collectProjectFiles(root, respectGitignore);
  await writeZip(destAbs, files, emptyDirs);
  return { zipPath: destAbs, files: files.length, bytes: files.reduce((s, f) => s + f.size, 0), skipped };
}

/** Resolves a link target relative to a Markdown file into a project-relative path (or null if outside). */
export function resolveLinkRel(mdRel: string, target: string): string | null {
  const parts = relDirname(mdRel).split('/').filter(Boolean);
  for (const seg of target.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  try {
    return normalizeRel(parts.join('/')) || null;
  } catch {
    return null;
  }
}

export async function exportFile(root: string, mdRel: string, destAbs: string): Promise<ExportSummary> {
  const md = normalizeRel(mdRel);
  const mdAbs = await resolveInProject(root, md);
  const st = await fs.stat(mdAbs);
  if (!st.isFile()) throw new AppError('INVALID_ARGUMENT', 'Not a file.');
  const files = new Map<string, FileItem>();
  files.set(md.toLowerCase(), { abs: mdAbs, rel: md, size: st.size });
  const skipped: string[] = [];

  const addDir = async (dirRel: string) => {
    const abs = await resolveInProject(root, dirRel);
    let dirents: Dirent[];
    try {
      dirents = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      const rel = joinRel(dirRel, d.name);
      if (d.isDirectory()) await addDir(rel);
      else if (d.isFile()) {
        const a = path.join(abs, d.name);
        files.set(rel.toLowerCase(), { abs: a, rel, size: (await fs.stat(a)).size });
      }
    }
  };
  if (isMarkdownName(md)) await addDir(imagesDirRel(md));

  const content = await fs.readFile(mdAbs, 'utf8');
  for (const ref of findLocalReferences(content)) {
    const rel = resolveLinkRel(md, ref);
    if (!rel) {
      skipped.push(ref);
      continue;
    }
    if (!isImageName(rel) || files.has(rel.toLowerCase())) continue;
    try {
      const abs = await resolveInProject(root, rel);
      const s = await fs.stat(abs);
      if (s.isFile()) files.set(rel.toLowerCase(), { abs, rel, size: s.size });
    } catch {
      skipped.push(ref);
    }
  }
  const list = [...files.values()];
  await writeZip(destAbs, list, []);
  return { zipPath: destAbs, files: list.length, bytes: list.reduce((s, f) => s + f.size, 0), skipped };
}

// ------------------------------------------------------------------ import

interface ValidEntry {
  entry: yauzl.Entry;
  rel: string;
  isDir: boolean;
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(
      file,
      { lazyEntries: true, autoClose: false, decodeStrings: true, validateEntrySizes: true },
      (err, zip) => (err || !zip ? reject(err ?? new Error('Cannot open ZIP')) : resolve(zip))
    );
  });
}

function zipError(message: string): AppError {
  return new AppError('ZIP_INVALID', message);
}

/** Pass 1: reads every central-directory entry and validates it. Nothing is written. */
export async function readAndValidate(zip: yauzl.ZipFile, limits: ZipLimits): Promise<ValidEntry[]> {
  const out: ValidEntry[] = [];
  const seen = new Set<string>();
  let total = 0;
  await new Promise<void>((resolve, reject) => {
    const fail = (e: unknown) => {
      zip.removeAllListeners('entry');
      reject(e instanceof AppError ? e : zipError(`Invalid ZIP archive: ${(e as Error)?.message ?? e}`));
    };
    zip.on('error', fail);
    zip.on('end', () => resolve());
    zip.on('entry', (entry: yauzl.Entry) => {
      try {
        const name = entry.fileName;
        if (out.length + 1 > limits.maxEntries) throw new AppError('ZIP_LIMIT', `Archive has more than ${limits.maxEntries} entries.`);
        if (name.includes('\\') || name.includes('\0')) throw zipError(`Invalid entry name: ${name}`);
        if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) throw zipError(`Absolute path in archive: ${name}`);
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (mode === 0o120000) throw zipError(`Symbolic links are not allowed: ${name}`);
        if (entry.generalPurposeBitFlag & 0x1) throw zipError(`Encrypted entries are not supported: ${name}`);
        const isDir = name.endsWith('/');
        let rel: string;
        try {
          rel = normalizeRel(name);
        } catch {
          throw zipError(`Unsafe path in archive: ${name}`);
        }
        for (const seg of rel.split('/')) {
          if (seg && nameProblem(seg)) throw zipError(`Invalid file name in archive: ${name}`);
        }
        if (rel !== '') {
          const key = rel.toLowerCase();
          if (seen.has(key) && !isDir) throw zipError(`Duplicate entry in archive: ${name}`);
          seen.add(key);
          if (!isDir) {
            total += entry.uncompressedSize;
            if (total > limits.maxTotalBytes) {
              throw new AppError('ZIP_LIMIT', `Archive expands to more than ${Math.round(limits.maxTotalBytes / 1048576)} MB.`);
            }
            if (
              entry.uncompressedSize > limits.ratioMinBytes &&
              entry.uncompressedSize / Math.max(1, entry.compressedSize) > limits.maxRatio
            ) {
              throw new AppError('ZIP_LIMIT', `Suspicious compression ratio (possible zip bomb): ${name}`);
            }
          }
          out.push({ entry, rel, isDir });
        }
        zip.readEntry();
      } catch (e) {
        fail(e);
      }
    });
    zip.readEntry();
  });
  return out;
}

function openEntryStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => (err || !stream ? reject(err ?? new Error('stream')) : resolve(stream)));
  });
}

/** Pass 2: extracts validated entries into destDir, counting the real bytes written. */
async function extractEntries(zip: yauzl.ZipFile, entries: ValidEntry[], destDir: string, limits: ZipLimits) {
  let written = 0;
  let files = 0;
  for (const { entry, rel, isDir } of entries) {
    const target = path.join(destDir, ...rel.split('/'));
    if (!isInside(destDir, target) || target === destDir) throw zipError(`Unsafe path in archive: ${entry.fileName}`);
    if (isDir) {
      await fs.mkdir(target, { recursive: true });
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        written += chunk.length;
        if (written > limits.maxTotalBytes) cb(new AppError('ZIP_LIMIT', 'Archive expands beyond the size limit.'));
        else cb(null, chunk);
      }
    });
    try {
      await pipeline(await openEntryStream(zip, entry), counter, createWriteStream(target, { flags: 'wx' }));
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw zipError(`Failed to extract ${entry.fileName}: ${(e as Error).message}`);
    }
    files++;
  }
  return { files, bytes: written };
}

async function extractZipTo(zipAbs: string, destDir: string, limits: ZipLimits) {
  let zip: yauzl.ZipFile;
  try {
    zip = await openZip(zipAbs);
  } catch (e) {
    throw zipError(`Not a valid ZIP file: ${(e as Error).message}`);
  }
  try {
    const entries = await readAndValidate(zip, limits);
    if (entries.length === 0) throw zipError('The archive is empty.');
    return await extractEntries(zip, entries, destDir, limits);
  } finally {
    zip.close();
  }
}

/** If dir contains exactly one sub-folder (and nothing else), return it; otherwise dir. */
async function contentRootOf(dir: string): Promise<string> {
  const items = await fs.readdir(dir, { withFileTypes: true });
  if (items.length === 1 && items[0].isDirectory() && items[0].name !== META_DIR) {
    return path.join(dir, items[0].name);
  }
  return dir;
}

function sanitizeFolderName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 120);
  return cleaned && !nameProblem(cleaned) ? cleaned : fallback;
}

async function uniqueName(dir: string, base: string, ext = ''): Promise<string> {
  for (let n = 1; n < 1000; n++) {
    const name = n === 1 ? `${base}${ext}` : `${base} (${n})${ext}`;
    try {
      await fs.lstat(path.join(dir, name));
    } catch {
      return name;
    }
  }
  throw new AppError('ALREADY_EXISTS', 'Could not find a free name.');
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

export async function importZipAsProject(zipAbs: string, parentAbs: string, limits = DEFAULT_LIMITS): Promise<ImportSummary> {
  if (!(await isDir(parentAbs))) throw new AppError('NOT_FOUND', 'Destination folder not found.');
  const tmp = path.join(parentAbs, `.mdviewer-tmp-${crypto.randomUUID()}`);
  await fs.mkdir(tmp);
  try {
    const { files, bytes } = await extractZipTo(zipAbs, tmp, limits);
    const contentRoot = await contentRootOf(tmp);
    const meta = await readMeta(contentRoot);
    const fallbackName = contentRoot !== tmp ? path.basename(contentRoot) : stemOf(path.basename(zipAbs));
    const displayName = meta?.name || fallbackName;
    const folder = await uniqueName(parentAbs, sanitizeFolderName(displayName, 'Imported Project'));
    const finalRoot = path.join(parentAbs, folder);
    await fs.rename(contentRoot, finalRoot);
    await fs.rm(tmp, { recursive: true, force: true });
    const project = await registerImportedProject(finalRoot, displayName);
    return { files, bytes, project, warnings: [] };
  } catch (err) {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

export async function importIntoProject(
  root: string,
  targetDirRel: string,
  srcAbs: string,
  limits = DEFAULT_LIMITS
): Promise<ImportSummary> {
  const targetRel = normalizeRel(targetDirRel);
  const targetAbs = await resolveInProject(root, targetRel);
  if (!(await isDir(targetAbs))) throw new AppError('NOT_FOUND', 'Target folder not found.');
  const st = await fs.lstat(srcAbs);
  if (!st.isFile()) throw new AppError('INVALID_ARGUMENT', 'Source must be a file.');

  if (isMarkdownName(srcAbs)) {
    if (st.size > 20 * 1024 * 1024) throw new AppError('TOO_LARGE', 'File is larger than 20 MB.');
    const ext = path.extname(srcAbs);
    const base = sanitizeFolderName(stemOf(path.basename(srcAbs)), 'imported');
    const name = await uniqueName(targetAbs, base, ext);
    await fs.copyFile(srcAbs, path.join(targetAbs, name), fs.constants.COPYFILE_EXCL);
    return { files: 1, bytes: st.size, targetPath: joinRel(targetRel, name), warnings: [] };
  }

  if (!/\.zip$/i.test(srcAbs)) throw new AppError('INVALID_ARGUMENT', 'Only .md and .zip files can be imported.');

  const tmp = path.join(root, `.mdviewer-tmp-${crypto.randomUUID()}`);
  await fs.mkdir(tmp);
  const warnings: string[] = [];
  try {
    const { files, bytes } = await extractZipTo(srcAbs, tmp, limits);
    const contentRoot = await contentRootOf(tmp);
    // Never overwrite this project's metadata with the archive's.
    if (await isDir(path.join(contentRoot, META_DIR))) {
      await fs.rm(path.join(contentRoot, META_DIR), { recursive: true, force: true });
      warnings.push('Project metadata in the archive was skipped.');
    }
    const items = await fs.readdir(contentRoot);
    const lowerExisting = new Set((await fs.readdir(targetAbs)).map((n) => n.toLowerCase()));
    let targetPath: string;
    if (items.length > 0 && items.every((n) => !lowerExisting.has(n.toLowerCase()))) {
      for (const n of items) await fs.rename(path.join(contentRoot, n), path.join(targetAbs, n));
      targetPath = items.length === 1 ? joinRel(targetRel, items[0]) : targetRel;
    } else {
      const base = contentRoot !== tmp ? path.basename(contentRoot) : stemOf(path.basename(srcAbs));
      const folder = await uniqueName(targetAbs, sanitizeFolderName(base, 'imported'));
      await fs.rename(contentRoot, path.join(targetAbs, folder));
      targetPath = joinRel(targetRel, folder);
      if (items.length > 0) warnings.push(`Names already existed, so the content was placed in "${folder}".`);
    }
    await fs.rm(tmp, { recursive: true, force: true });
    return { files, bytes, targetPath, warnings };
  } catch (err) {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}
