import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { addIgnoreRule, getGitignore, getIgnored, removeIgnoreRule, setGitignore, PRESETS } from '../../src/main/services/gitignore';
import { tmpDir, write } from '../helpers/tmp';

describe('gitignore', () => {
  it('creates the file when adding the first rule and avoids duplicates', async () => {
    const root = await tmpDir();
    expect((await getGitignore(root)).exists).toBe(false);
    await addIgnoreRule(root, '*.log');
    await addIgnoreRule(root, '*.log');
    const g = await getGitignore(root);
    expect(g.exists).toBe(true);
    expect(g.rules).toEqual(['*.log']);
    expect(g.content).toBe('*.log\n');
  });

  it('removes rules and preserves comments and CRLF line endings', async () => {
    const root = await tmpDir();
    await setGitignore(root, '# comment\r\n*.log\r\ndrafts/\r\n');
    await removeIgnoreRule(root, '*.log');
    const content = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
    expect(content).toBe('# comment\r\ndrafts/\r\n');
    await addIgnoreRule(root, 'tmp/');
    expect((await getGitignore(root)).content).toBe('# comment\r\ndrafts/\r\ntmp/\r\n');
  });

  it('rejects invalid patterns', async () => {
    const root = await tmpDir();
    await expect(addIgnoreRule(root, '')).rejects.toBeTruthy();
    await expect(addIgnoreRule(root, 'a\nb')).rejects.toBeTruthy();
    await expect(addIgnoreRule(root, '# c')).rejects.toBeTruthy();
  });

  it('lists ignored files and folders using gitignore semantics', async () => {
    const root = await tmpDir();
    await write(path.join(root, 'a.md'), '');
    await write(path.join(root, 'debug.log'), '');
    await write(path.join(root, 'sub', 'trace.log'), '');
    await write(path.join(root, 'sub', 'keep.md'), '');
    await write(path.join(root, 'drafts', 'x.md'), '');
    await write(path.join(root, 'important.log'), '');
    await setGitignore(root, '*.log\n!important.log\ndrafts/\n/a.md\n');
    const ignored = (await getIgnored(root)).sort();
    expect(ignored).toEqual(['a.md', 'debug.log', 'drafts', 'sub/trace.log']);
  });

  it('ships common presets', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(expect.arrayContaining(['os', 'node', 'logs', 'env']));
  });
});
