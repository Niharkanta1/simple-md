// '/'-separated, project-relative path helpers (renderer side).

export function dirname(rel: string): string {
  const i = rel.lastIndexOf('/');
  return i === -1 ? '' : rel.slice(0, i);
}

export function basename(rel: string): string {
  const i = rel.lastIndexOf('/');
  return i === -1 ? rel : rel.slice(i + 1);
}

export function join(...parts: string[]): string {
  return parts.filter((p) => p !== '').join('/');
}

export function extname(name: string): string {
  const b = basename(name);
  const i = b.lastIndexOf('.');
  return i <= 0 ? '' : b.slice(i + 1).toLowerCase();
}

/**
 * Resolves `target` (a link destination, possibly URL-encoded) relative to
 * the folder of `fromFile`. Returns null if it escapes the project root.
 */
export function resolveRelative(fromFile: string, target: string): string | null {
  let t = target;
  try {
    t = decodeURI(t);
  } catch {
    /* keep raw */
  }
  const parts = dirname(fromFile).split('/').filter(Boolean);
  for (const seg of t.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}

/** Encodes each path segment for use inside a URL. */
export function encodePath(rel: string): string {
  return rel
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
}

/** True if `path` equals `ancestor` or is inside it. */
export function isWithin(path: string, ancestor: string): boolean {
  return ancestor === '' || path === ancestor || path.startsWith(ancestor + '/');
}

/** Replaces the `from` prefix with `to` if `path` is within `from`. */
export function remap(path: string, from: string, to: string): string {
  if (path === from) return to;
  if (path.startsWith(from + '/')) return to + path.slice(from.length);
  return path;
}

export const MARKDOWN_EXTS = ['md', 'markdown', 'mdown', 'mkd'];
export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'ico'];
const TEXT_EXTS = [
  'txt', 'json', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'conf', 'csv', 'tsv', 'xml', 'html', 'htm', 'css',
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp',
  'cs', 'sh', 'bash', 'ps1', 'bat', 'cmd', 'sql', 'log', 'env', 'gitignore', 'gitattributes', 'editorconfig',
  'svelte', 'vue', 'php', 'lua', 'r', 'swift', 'dart', 'tex', 'rst', 'adoc', 'org'
];

export type FileKind = 'markdown' | 'text' | 'image' | 'other';

export function fileKind(name: string): FileKind {
  const ext = extname(name);
  const b = basename(name);
  if (MARKDOWN_EXTS.includes(ext)) return 'markdown';
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (TEXT_EXTS.includes(ext) || ext === '' || (b.startsWith('.') && !b.slice(1).includes('.'))) return 'text';
  return 'other';
}
