import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import type { EntryInfo, TreeNode } from '../../shared/types';
import { AppError, isErrno } from '../core/errors';
import { atomicWrite, TMP_SUFFIX } from '../core/atomicWrite';
import { joinRel, normalizeRel, relBasename, relDirname, resolveInProject, validateName } from '../core/pathGuard';
import { moveToTrash } from '../core/trash';
import { imagesDirName, imagesDirRel, isMarkdownName, rewriteImageLinks, stemOf } from './images';
import { META_DIR } from './project';

export const MAX_TREE_ENTRIES = 20000;
export const MAX_TEXT_FILE_BYTES = 20 * 1024 * 1024;

/** Entries never shown in the tree nor exported. */
export function isHiddenEntry(name: string): boolean {
  return name === META_DIR || name === '.git' || name.startsWith('.mdviewer-tmp-') || name.endsWith(TMP_SUFFIX);
}

function sortEntries(a: { name: string; type: string }, b: { name: string; type: string }): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
}

export async function listTree(root: string): Promise<TreeNode> {
  let count = 0;
  const walk = async (abs: string, rel: string): Promise<TreeNode[]> => {
    let dirents: Dirent[];
    try {
      dirents = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return [];
    }
    const nodes: TreeNode[] = [];
    for (const d of dirents) {
      if (isHiddenEntry(d.name) || d.isSymbolicLink()) continue;
      if (++count > MAX_TREE_ENTRIES) break;
      const childRel = joinRel(rel, d.name);
      if (d.isDirectory()) {
        nodes.push({ name: d.name, path: childRel, type: 'dir', children: await walk(path.join(abs, d.name), childRel) });
      } else if (d.isFile()) {
        nodes.push({ name: d.name, path: childRel, type: 'file' });
      }
    }
    return nodes.sort(sortEntries);
  };
  return { name: path.basename(root), path: '', type: 'dir', children: await walk(root, '') };
}

export async function readFile(root: string, rel: string): Promise<string> {
  const abs = await resolveInProject(root, rel);
  const st = await fs.stat(abs);
  if (!st.isFile()) throw new AppError('INVALID_ARGUMENT', 'Not a file.');
  if (st.size > MAX_TEXT_FILE_BYTES) throw new AppError('TOO_LARGE', 'File is too large to open (over 20 MB).');
  return fs.readFile(abs, 'utf8');
}

export async function writeFile(root: string, rel: string, content: string): Promise<void> {
  if (typeof content !== 'string') throw new AppError('INVALID_ARGUMENT', 'Content must be text.');
  if (normalizeRel(rel) === '') throw new AppError('INVALID_ARGUMENT', 'Invalid file path.');
  const abs = await resolveInProject(root, rel);
  try {
    const st = await fs.stat(abs);
    if (!st.isFile()) throw new AppError('INVALID_ARGUMENT', 'Not a file.');
  } catch (err) {
    if (!isErrno(err, 'ENOENT')) throw err;
    await fs.mkdir(path.dirname(abs), { recursive: true });
  }
  await atomicWrite(abs, content);
}

async function exists(abs: string): Promise<boolean> {
  try {
    await fs.lstat(abs);
    return true;
  } catch {
    return false;
  }
}

async function requireDir(root: string, rel: string): Promise<string> {
  const abs = await resolveInProject(root, rel);
  let st;
  try {
    st = await fs.stat(abs);
  } catch {
    throw new AppError('NOT_FOUND', 'Folder not found.');
  }
  if (!st.isDirectory()) throw new AppError('INVALID_ARGUMENT', 'Target is not a folder.');
  return abs;
}

export async function createFile(root: string, dirRel: string, name: string): Promise<string> {
  let fileName = typeof name === 'string' ? name.trim() : '';
  if (fileName && !/\.[^./\\]+$/.test(fileName)) fileName += '.md';
  validateName(fileName);
  const dirAbs = await requireDir(root, dirRel);
  const rel = joinRel(normalizeRel(dirRel), fileName);
  await resolveInProject(root, rel);
  const initial = isMarkdownName(fileName) ? `# ${stemOf(fileName)}\n\n` : '';
  try {
    await fs.writeFile(path.join(dirAbs, fileName), initial, { flag: 'wx' });
  } catch (err) {
    if (isErrno(err, 'EEXIST')) throw new AppError('ALREADY_EXISTS', `"${fileName}" already exists.`);
    throw err;
  }
  return rel;
}

export async function createDir(root: string, dirRel: string, name: string): Promise<string> {
  const dirName = typeof name === 'string' ? name.trim() : '';
  validateName(dirName);
  if (isHiddenEntry(dirName)) throw new AppError('INVALID_NAME', 'That name is reserved by the app.');
  const parentAbs = await requireDir(root, dirRel);
  const rel = joinRel(normalizeRel(dirRel), dirName);
  try {
    await fs.mkdir(path.join(parentAbs, dirName));
  } catch (err) {
    if (isErrno(err, 'EEXIST')) throw new AppError('ALREADY_EXISTS', `"${dirName}" already exists.`);
    throw err;
  }
  return rel;
}

export async function entryInfo(root: string, rel: string): Promise<EntryInfo> {
  const abs = await resolveInProject(root, rel);
  let isDir = false;
  try {
    isDir = (await fs.stat(abs)).isDirectory();
  } catch {
    return { exists: false, isDir: false, imagesDir: null };
  }
  let imagesDir: string | null = null;
  if (!isDir && isMarkdownName(relBasename(normalizeRel(rel)))) {
    const imgRel = imagesDirRel(normalizeRel(rel));
    try {
      if ((await fs.stat(await resolveInProject(root, imgRel))).isDirectory()) imagesDir = imgRel;
    } catch {
      /* none */
    }
  }
  return { exists: true, isDir, imagesDir };
}

function sameIgnoringCase(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * Moves/renames `srcRel` to `destRel`. When the source is a Markdown file
 * whose `<stem>-images` folder exists, that folder is moved alongside and
 * image links in the file are rewritten if the folder name changes. All
 * steps roll back on failure.
 */
async function relocate(root: string, srcRel: string, destRel: string): Promise<string> {
  const srcAbs = await resolveInProject(root, srcRel);
  const destAbs = await resolveInProject(root, destRel);
  if (!(await exists(srcAbs))) throw new AppError('NOT_FOUND', 'File or folder not found.');
  const caseOnly = srcAbs !== destAbs && sameIgnoringCase(srcAbs, destAbs);
  if (!caseOnly && (await exists(destAbs))) {
    throw new AppError('ALREADY_EXISTS', `"${relBasename(destRel)}" already exists in the target folder.`);
  }

  const srcStat = await fs.stat(srcAbs);
  let imgSrcAbs: string | null = null;
  let imgDestAbs: string | null = null;
  let oldImgName = '';
  let newImgName = '';
  if (srcStat.isFile() && isMarkdownName(relBasename(srcRel))) {
    const imgSrcRel = imagesDirRel(srcRel);
    const candidate = await resolveInProject(root, imgSrcRel);
    try {
      if ((await fs.stat(candidate)).isDirectory()) {
        oldImgName = relBasename(imgSrcRel);
        newImgName = isMarkdownName(relBasename(destRel)) ? imagesDirName(relBasename(destRel)) : oldImgName;
        const imgDestRel = joinRel(relDirname(destRel), newImgName);
        imgSrcAbs = candidate;
        imgDestAbs = await resolveInProject(root, imgDestRel);
        const imgCaseOnly = imgSrcAbs !== imgDestAbs && sameIgnoringCase(imgSrcAbs, imgDestAbs);
        if (imgSrcAbs === imgDestAbs) {
          imgSrcAbs = imgDestAbs = null;
        } else if (!imgCaseOnly && (await exists(imgDestAbs))) {
          throw new AppError('ALREADY_EXISTS', `Image folder "${newImgName}" already exists in the target folder.`);
        }
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
    }
  }

  await fs.rename(srcAbs, destAbs);
  if (imgSrcAbs && imgDestAbs) {
    try {
      await fs.rename(imgSrcAbs, imgDestAbs);
    } catch (err) {
      await fs.rename(destAbs, srcAbs).catch(() => {});
      throw err;
    }
    if (oldImgName !== newImgName) {
      try {
        const content = await fs.readFile(destAbs, 'utf8');
        const updated = rewriteImageLinks(content, oldImgName, newImgName);
        if (updated !== content) await atomicWrite(destAbs, updated);
      } catch (err) {
        await fs.rename(imgDestAbs, imgSrcAbs).catch(() => {});
        await fs.rename(destAbs, srcAbs).catch(() => {});
        throw err;
      }
    }
  }
  return normalizeRel(destRel);
}

export async function renameEntry(root: string, rel: string, newName: string): Promise<string> {
  const src = normalizeRel(rel);
  if (src === '') throw new AppError('INVALID_ARGUMENT', 'Cannot rename the project root here.');
  const name = typeof newName === 'string' ? newName.trim() : '';
  validateName(name);
  if (isHiddenEntry(name)) throw new AppError('INVALID_NAME', 'That name is reserved by the app.');
  if (name === relBasename(src)) return src;
  return relocate(root, src, joinRel(relDirname(src), name));
}

export async function moveEntry(root: string, rel: string, targetDirRel: string): Promise<string> {
  const src = normalizeRel(rel);
  const target = normalizeRel(targetDirRel);
  if (src === '') throw new AppError('INVALID_ARGUMENT', 'Cannot move the project root.');
  if (relDirname(src) === target) return src;
  if (target === src || target.startsWith(src + '/')) {
    throw new AppError('INVALID_ARGUMENT', 'Cannot move a folder into itself.');
  }
  await requireDir(root, target);
  return relocate(root, src, joinRel(target, relBasename(src)));
}

export async function deleteEntry(root: string, rel: string, includeImages: boolean): Promise<void> {
  const src = normalizeRel(rel);
  if (src === '') throw new AppError('INVALID_ARGUMENT', 'Cannot delete the project root here.');
  const info = await entryInfo(root, src);
  if (!info.exists) throw new AppError('NOT_FOUND', 'File or folder not found.');
  await moveToTrash(await resolveInProject(root, src));
  if (includeImages && info.imagesDir) {
    await moveToTrash(await resolveInProject(root, info.imagesDir));
  }
}
