import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { nameProblem, normalizeRel, resolveInProject } from '../../src/main/core/pathGuard';
import { tmpDir } from '../helpers/tmp';

describe('normalizeRel', () => {
  it('normalises separators and dots', () => {
    expect(normalizeRel('a/b.md')).toBe('a/b.md');
    expect(normalizeRel('a\\b\\c.md')).toBe('a/b/c.md');
    expect(normalizeRel('./a//b/')).toBe('a/b');
    expect(normalizeRel('')).toBe('');
    expect(normalizeRel('.')).toBe('');
  });

  it.each([
    '../x',
    'a/../../x',
    'a/..',
    '..\\..\\Windows\\win.ini',
    '/etc/passwd',
    '\\\\server\\share\\x',
    'C:\\Windows',
    'C:relative',
    'c:/x',
    'a/CON',
    'nul.txt',
    'COM1',
    'file.md:stream',
    'a/b\0c',
    'what?.md'
  ])('rejects %j', (p) => {
    expect(() => normalizeRel(p)).toThrow();
  });
});

describe('nameProblem', () => {
  it('accepts normal names', () => {
    expect(nameProblem('notes.md')).toBeNull();
    expect(nameProblem('My Notes (2)')).toBeNull();
    expect(nameProblem('.gitignore')).toBeNull();
    expect(nameProblem('ünïcødé 文件.md')).toBeNull();
  });
  it.each(['', ' x', 'x ', 'a/b', 'a\\b', 'a:b', 'x.', 'CON', 'lpt1.txt', '..', 'a*b', 'a"b', 'x'.repeat(256)])(
    'rejects %j',
    (n) => {
      expect(nameProblem(n)).not.toBeNull();
    }
  );
});

describe('resolveInProject', () => {
  it('resolves paths inside the root', async () => {
    const root = await tmpDir();
    expect(await resolveInProject(root, 'a/b.md')).toBe(path.join(root, 'a', 'b.md'));
    expect(await resolveInProject(root, '')).toBe(path.resolve(root));
  });

  it('rejects traversal', async () => {
    const root = await tmpDir();
    await expect(resolveInProject(root, '../outside.md')).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' });
  });

  it('rejects paths escaping through a junction/symlink', async () => {
    const outside = await tmpDir('mdv-outside-');
    const root = await tmpDir();
    await fs.writeFile(path.join(outside, 'secret.txt'), 'secret');
    try {
      await fs.symlink(outside, path.join(root, 'link'), 'junction');
    } catch {
      return; // symlinks not permitted on this machine; nothing to test
    }
    await expect(resolveInProject(root, 'link/secret.txt')).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' });
    await expect(resolveInProject(root, 'link/new-file.md')).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' });
  });
});
