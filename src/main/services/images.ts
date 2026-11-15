import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError, isErrno } from '../core/errors';
import { joinRel, nameProblem, relBasename, relDirname, resolveInProject } from '../core/pathGuard';

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'];
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

export function isImageName(name: string): boolean {
  const ext = path.extname(name).slice(1).toLowerCase();
  return IMAGE_EXTS.includes(ext);
}

export function isMarkdownName(name: string): boolean {
  return /\.(md|markdown|mdown|mkd)$/i.test(name);
}

/** "notes.md" -> "notes" */
export function stemOf(fileName: string): string {
  const ext = path.extname(fileName);
  return ext ? fileName.slice(0, -ext.length) : fileName;
}

/** Folder name used for a Markdown file's images: "<stem>-images". */
export function imagesDirName(mdFileName: string): string {
  return `${stemOf(mdFileName)}-images`;
}

/** Project-relative path of the images folder for a Markdown file. */
export function imagesDirRel(mdRel: string): string {
  return joinRel(relDirname(mdRel), imagesDirName(relBasename(mdRel)));
}

/** Encodes a relative link path so it is safe inside a Markdown link destination. */
export function encodeLinkPath(p: string): string {
  return p
    .split('/')
    .map((seg) => encodeURIComponent(seg).replace(/\(/g, '%28').replace(/\)/g, '%29'))
    .join('/');
}

function timestamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

const MAGIC: Record<string, (b: Uint8Array) => boolean> = {
  png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  gif: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  webp: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45,
  bmp: (b) => b[0] === 0x42 && b[1] === 0x4d
};

/** Detects a raster image format from magic bytes. */
export function sniffImageExt(bytes: Uint8Array): string | null {
  for (const [ext, test] of Object.entries(MAGIC)) {
    if (bytes.length >= 12 && test(bytes)) return ext;
  }
  return null;
}

/** Writes `data` to `<dir>/<base><-n>.<ext>` choosing the first free name. Returns the file name. */
async function writeUnique(dir: string, base: string, ext: string, data: Uint8Array | null, copyFrom?: string): Promise<string> {
  for (let n = 0; n < 1000; n++) {
    const name = n === 0 ? `${base}.${ext}` : `${base}-${n}.${ext}`;
    const target = path.join(dir, name);
    try {
      if (copyFrom) {
        await fs.copyFile(copyFrom, target, fs.constants.COPYFILE_EXCL);
      } else {
        await fs.writeFile(target, data!, { flag: 'wx' });
      }
      return name;
    } catch (err) {
      if (!isErrno(err, 'EEXIST')) throw err;
    }
  }
  throw new AppError('ALREADY_EXISTS', 'Could not find a free file name.');
}

async function ensureImagesDir(root: string, mdRel: string): Promise<{ abs: string; dirName: string }> {
  const dirRel = imagesDirRel(mdRel);
  const abs = await resolveInProject(root, dirRel);
  await fs.mkdir(abs, { recursive: true });
  return { abs, dirName: relBasename(dirRel) };
}

/** Saves pasted image bytes into `<stem>-images/` and returns the relative Markdown link target. */
export async function savePastedImage(root: string, mdRel: string, bytes: Uint8Array, ext: string): Promise<string> {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new AppError('INVALID_ARGUMENT', 'No image data.');
  if (bytes.length > MAX_IMAGE_BYTES) throw new AppError('TOO_LARGE', 'Image is larger than 25 MB.');
  const sniffed = sniffImageExt(bytes);
  if (!sniffed) throw new AppError('INVALID_ARGUMENT', 'Clipboard data is not a supported image (PNG, JPEG, GIF, WebP, BMP).');
  let finalExt = sniffed;
  const wanted = (ext || '').toLowerCase().replace(/^\./, '');
  if (sniffed === 'jpg' && wanted === 'jpeg') finalExt = 'jpeg';
  await resolveInProject(root, mdRel); // validate md path
  const { abs, dirName } = await ensureImagesDir(root, mdRel);
  const name = await writeUnique(abs, `image-${timestamp()}`, finalExt, bytes);
  return `./${encodeLinkPath(dirName)}/${encodeLinkPath(name)}`;
}

/** Copies an image file from anywhere on disk into `<stem>-images/`. Returns the relative link. */
export async function importImageFile(root: string, mdRel: string, sourceAbs: string): Promise<string> {
  if (typeof sourceAbs !== 'string' || !path.isAbsolute(sourceAbs)) throw new AppError('INVALID_ARGUMENT', 'Invalid image path.');
  if (!isImageName(sourceAbs)) throw new AppError('INVALID_ARGUMENT', `Not an image file: ${path.basename(sourceAbs)}`);
  const st = await fs.lstat(sourceAbs);
  if (!st.isFile()) throw new AppError('INVALID_ARGUMENT', 'Only regular files can be imported.');
  if (st.size > MAX_IMAGE_BYTES) throw new AppError('TOO_LARGE', 'Image is larger than 25 MB.');
  await resolveInProject(root, mdRel);
  const { abs, dirName } = await ensureImagesDir(root, mdRel);
  const ext = path.extname(sourceAbs).slice(1).toLowerCase();
  let base = stemOf(path.basename(sourceAbs)).replace(/[<>:"|?*\u0000-\u001f]/g, '_').trim() || 'image';
  if (nameProblem(`${base}.${ext}`)) base = 'image';
  const name = await writeUnique(abs, base, ext, null, sourceAbs);
  return `./${encodeLinkPath(dirName)}/${encodeLinkPath(name)}`;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrites links that point into `oldDir/` so they point into `newDir/`.
 * Handles inline links/images `](./old/..)`, `](<old/..>)`, reference
 * definitions `[x]: ./old/..` and HTML `src="old/.."`/`href=`. Both the raw
 * and URL-encoded spellings of the folder are matched. Fenced code blocks are
 * left untouched.
 */
export function rewriteImageLinks(content: string, oldDir: string, newDir: string): string {
  if (oldDir === newDir) return content;
  const variants: Array<[string, string]> = [[oldDir, newDir]];
  const encOld = encodeLinkPath(oldDir);
  if (encOld !== oldDir) variants.push([encOld, encodeLinkPath(newDir)]);

  const prefix = String.raw`(\]\(\s*<?|^\s{0,3}\[[^\]]+\]:\s*<?|(?:src|href)\s*=\s*["']?)(\.\/)?`;
  const regexes = variants.map(
    ([o, n]) => [new RegExp(prefix + escapeRe(o) + '/', 'gm'), n] as const
  );

  const lines = content.split(/(\r?\n)/); // keep separators
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i];
    const m = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = null;
      continue;
    }
    if (m) {
      fence = m[1];
      continue;
    }
    let out = line;
    for (const [re, n] of regexes) {
      out = out.replace(re, (_all, lead: string, dot: string | undefined) => `${lead}${dot ?? ''}${n}/`);
    }
    lines[i] = out;
  }
  return lines.join('');
}

/** Extracts relative image/link targets referenced by a Markdown document. */
export function findLocalReferences(content: string): string[] {
  const refs = new Set<string>();
  const add = (raw: string) => {
    let t = raw.trim();
    if (t.startsWith('<') && t.endsWith('>')) t = t.slice(1, -1);
    t = t.split(/\s+["'(]/)[0];
    t = t.split('#')[0].split('?')[0];
    if (!t || /^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith('/') || t.startsWith('//')) return;
    try {
      t = decodeURI(t);
    } catch {
      /* keep raw */
    }
    refs.add(t);
  };
  let fence = false;
  for (const line of content.split(/\r?\n/)) {
    if (/^\s{0,3}(`{3,}|~{3,})/.test(line)) {
      fence = !fence;
      continue;
    }
    if (fence) continue;
    for (const m of line.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)[^)]*\)/g)) add(m[1]);
    for (const m of line.matchAll(/^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)/g)) add(m[1]);
    for (const m of line.matchAll(/<img[^>]+src\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  }
  return [...refs];
}
