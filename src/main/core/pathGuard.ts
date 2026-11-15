import path from 'node:path';
import fs from 'node:fs/promises';
import { AppError, isErrno } from './errors';

const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
// eslint-disable-next-line no-control-regex
const INVALID_CHARS = /[<>:"|?*\u0000-\u001f]/;

/** Returns an error message when `name` is not a valid single file/folder name, else null. */
export function nameProblem(name: string): string | null {
  if (typeof name !== 'string' || name.length === 0) return 'Name cannot be empty.';
  if (name.trim() !== name) return 'Name cannot start or end with spaces.';
  if (name === '.' || name === '..') return 'Invalid name.';
  if (name.length > 255) return 'Name is too long.';
  if (/[\\/]/.test(name)) return 'Name cannot contain / or \\.';
  if (INVALID_CHARS.test(name)) return 'Name cannot contain < > : " | ? * or control characters.';
  if (name.endsWith('.')) return 'Name cannot end with a dot.';
  if (RESERVED.test(name)) return `"${name}" is a reserved name on Windows.`;
  return null;
}

export function validateName(name: string): string {
  const problem = nameProblem(name);
  if (problem) throw new AppError('INVALID_NAME', problem);
  return name;
}

/**
 * Normalises a project-relative path to '/'-separated form without leading or
 * trailing separators. Rejects anything that is absolute, contains '..',
 * drive letters, UNC prefixes, NUL bytes, ADS (':'), or reserved names.
 * Returns '' for the project root.
 */
export function normalizeRel(rel: string): string {
  if (typeof rel !== 'string') throw new AppError('INVALID_ARGUMENT', 'Path must be a string.');
  if (rel.includes('\0')) throw new AppError('PATH_OUTSIDE_ROOT', 'Invalid path.');
  const p = rel.replace(/\\/g, '/');
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) {
    throw new AppError('PATH_OUTSIDE_ROOT', 'Absolute paths are not allowed.');
  }
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') throw new AppError('PATH_OUTSIDE_ROOT', 'Path may not leave the project folder.');
    if (INVALID_CHARS.test(seg) || RESERVED.test(seg)) {
      throw new AppError('PATH_OUTSIDE_ROOT', `Invalid path segment "${seg}".`);
    }
    out.push(seg);
  }
  return out.join('/');
}

/** True if `child` equals `parent` or lies inside it. */
export function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  if (rel === '') return true;
  if (path.isAbsolute(rel)) return false;
  return rel !== '..' && !rel.startsWith('..' + path.sep);
}

export function joinRel(...parts: string[]): string {
  return parts.filter((p) => p !== '').join('/');
}

export function relDirname(rel: string): string {
  const i = rel.lastIndexOf('/');
  return i === -1 ? '' : rel.slice(0, i);
}

export function relBasename(rel: string): string {
  const i = rel.lastIndexOf('/');
  return i === -1 ? rel : rel.slice(i + 1);
}

/** Converts an absolute path inside root into a '/'-separated relative path. */
export function toRel(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join('/');
}

/**
 * Resolves a project-relative path into an absolute path that is guaranteed
 * to stay inside the project root — including after resolving symlinks and
 * junctions of the deepest existing ancestor.
 */
export async function resolveInProject(root: string, rel: string): Promise<string> {
  const n = normalizeRel(rel);
  const abs = n === '' ? path.resolve(root) : path.resolve(root, ...n.split('/'));
  if (!isInside(path.resolve(root), abs)) {
    throw new AppError('PATH_OUTSIDE_ROOT', 'Path may not leave the project folder.');
  }
  let realRoot: string;
  try {
    realRoot = await fs.realpath(root);
  } catch {
    throw new AppError('PROJECT_UNAVAILABLE', 'Project folder is not available.');
  }
  let probe = abs;
  for (;;) {
    try {
      const real = await fs.realpath(probe);
      if (!isInside(realRoot, real)) {
        throw new AppError('PATH_OUTSIDE_ROOT', 'Path resolves outside the project folder.');
      }
      break;
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (!isErrno(err, 'ENOENT') && !isErrno(err, 'ENOTDIR')) throw err;
      const parent = path.dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
  }
  return abs;
}
