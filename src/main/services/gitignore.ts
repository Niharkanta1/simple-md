import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import type { GitignoreData, GitignorePreset } from '../../shared/types';
import { AppError, isErrno } from '../core/errors';
import { atomicWrite } from '../core/atomicWrite';
import { joinRel } from '../core/pathGuard';
import { isHiddenEntry, MAX_TREE_ENTRIES } from './fsOps';

const FILE = '.gitignore';

export const PRESETS: GitignorePreset[] = [
  { id: 'os', label: 'OS files', patterns: ['.DS_Store', 'Thumbs.db', 'desktop.ini', 'ehthumbs.db'] },
  { id: 'editors', label: 'Editors & IDEs', patterns: ['.vscode/', '.idea/', '*.swp', '*~'] },
  { id: 'node', label: 'Node.js', patterns: ['node_modules/', 'npm-debug.log*', 'yarn-error.log*'] },
  { id: 'logs', label: 'Logs & temp files', patterns: ['*.log', '*.tmp', '*.temp', '*.bak'] },
  { id: 'build', label: 'Build output', patterns: ['dist/', 'build/', 'out/'] },
  { id: 'env', label: 'Secrets / env files', patterns: ['.env', '.env.*', '!.env.example'] },
  { id: 'python', label: 'Python', patterns: ['__pycache__/', '*.pyc', '.venv/'] },
  { id: 'mdviewer', label: 'Simple Markdown metadata', patterns: ['.mdviewer/'] }
];

function parseRules(content: string): string[] {
  return content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
}

async function readContent(root: string): Promise<{ exists: boolean; content: string }> {
  try {
    return { exists: true, content: await fs.readFile(path.join(root, FILE), 'utf8') };
  } catch (err) {
    if (isErrno(err, 'ENOENT')) return { exists: false, content: '' };
    throw err;
  }
}

export async function getGitignore(root: string): Promise<GitignoreData> {
  const { exists, content } = await readContent(root);
  return { exists, content, rules: parseRules(content) };
}

export async function setGitignore(root: string, content: string): Promise<GitignoreData> {
  if (typeof content !== 'string') throw new AppError('INVALID_ARGUMENT', 'Content must be text.');
  if (content.length > 1024 * 1024) throw new AppError('TOO_LARGE', '.gitignore is too large.');
  await atomicWrite(path.join(root, FILE), content);
  return getGitignore(root);
}

function validatePattern(pattern: string): string {
  const p = typeof pattern === 'string' ? pattern.trim() : '';
  if (!p) throw new AppError('INVALID_ARGUMENT', 'Pattern cannot be empty.');
  if (/[\r\n]/.test(p)) throw new AppError('INVALID_ARGUMENT', 'Pattern must be a single line.');
  if (p.startsWith('#')) throw new AppError('INVALID_ARGUMENT', 'Patterns cannot start with # (that is a comment).');
  return p;
}

export async function addIgnoreRule(root: string, pattern: string): Promise<GitignoreData> {
  const p = validatePattern(pattern);
  const { content } = await readContent(root);
  if (parseRules(content).includes(p)) return getGitignore(root);
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const prefix = content === '' || content.endsWith('\n') ? content : content + eol;
  return setGitignore(root, `${prefix}${p}${eol}`);
}

export async function removeIgnoreRule(root: string, pattern: string): Promise<GitignoreData> {
  const p = validatePattern(pattern);
  const { exists, content } = await readContent(root);
  if (!exists) return getGitignore(root);
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const kept = content.split(/\r?\n/).filter((l) => l.trim() !== p);
  return setGitignore(root, kept.join(eol));
}

export async function loadMatcher(root: string): Promise<Ignore> {
  const { content } = await readContent(root);
  return ignore({ allowRelativePaths: true }).add(content);
}

/**
 * Returns project-relative paths that are ignored by the root .gitignore.
 * When a folder is ignored it is returned and its contents are not listed
 * (they are implicitly ignored).
 */
export async function getIgnored(root: string): Promise<string[]> {
  const ig = await loadMatcher(root);
  const out: string[] = [];
  let count = 0;
  const walk = async (abs: string, rel: string) => {
    let dirents: Dirent[];
    try {
      dirents = await fs.readdir(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      if (isHiddenEntry(d.name) || d.isSymbolicLink()) continue;
      if (++count > MAX_TREE_ENTRIES) return;
      const childRel = joinRel(rel, d.name);
      if (d.isDirectory()) {
        if (ig.ignores(childRel + '/')) out.push(childRel);
        else await walk(path.join(abs, d.name), childRel);
      } else if (d.isFile() && ig.ignores(childRel)) {
        out.push(childRel);
      }
    }
  };
  await walk(root, '');
  return out;
}
