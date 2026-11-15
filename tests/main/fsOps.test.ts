import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createDir,
  createFile,
  deleteEntry,
  entryInfo,
  listTree,
  moveEntry,
  readFile,
  renameEntry,
  writeFile
} from '../../src/main/services/fsOps';
import { exists, PNG_1PX, tmpDir, write } from '../helpers/tmp';

async function sample(): Promise<string> {
  const root = await tmpDir();
  await write(path.join(root, '.mdviewer', 'project.json'), '{}');
  await write(path.join(root, 'notes.md'), '# Notes\n\n![s](./notes-images/shot.png)\n![t](notes-images/two.png)\n');
  await write(path.join(root, 'notes-images', 'shot.png'), PNG_1PX);
  await write(path.join(root, 'notes-images', 'two.png'), PNG_1PX);
  await write(path.join(root, 'guides', 'setup.md'), '# Setup');
  await write(path.join(root, 'b.txt'), 'b');
  return root;
}

describe('listTree', () => {
  it('lists folders first, hides metadata', async () => {
    const root = await sample();
    const tree = await listTree(root);
    const names = tree.children!.map((c) => c.name);
    expect(names).toEqual(['guides', 'notes-images', 'b.txt', 'notes.md']);
    expect(tree.children![0].children![0]).toMatchObject({ name: 'setup.md', path: 'guides/setup.md', type: 'file' });
  });
});

describe('create / read / write', () => {
  it('adds .md when no extension is given and refuses duplicates', async () => {
    const root = await sample();
    expect(await createFile(root, 'guides', 'intro')).toBe('guides/intro.md');
    expect(await readFile(root, 'guides/intro.md')).toBe('# intro\n\n');
    await expect(createFile(root, 'guides', 'intro.md')).rejects.toMatchObject({ code: 'ALREADY_EXISTS' });
    expect(await createFile(root, '', '.gitignore')).toBe('.gitignore');
  });

  it('rejects invalid names', async () => {
    const root = await sample();
    await expect(createFile(root, '', 'CON')).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(createFile(root, '', 'a:b')).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(createDir(root, '', '.mdviewer')).rejects.toMatchObject({ code: 'INVALID_NAME' });
    await expect(createFile(root, '../', 'x')).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' });
  });

  it('writes atomically and leaves no temp files', async () => {
    const root = await sample();
    await writeFile(root, 'notes.md', 'changed');
    expect(await readFile(root, 'notes.md')).toBe('changed');
    const leftovers = (await fs.readdir(root)).filter((n) => n.endsWith('.mdvtmp'));
    expect(leftovers).toEqual([]);
  });
});

describe('rename', () => {
  it('renames the images folder with the markdown file and rewrites links', async () => {
    const root = await sample();
    const to = await renameEntry(root, 'notes.md', 'ideas.md');
    expect(to).toBe('ideas.md');
    expect(await exists(path.join(root, 'notes-images'))).toBe(false);
    expect(await exists(path.join(root, 'ideas-images', 'shot.png'))).toBe(true);
    const content = await readFile(root, 'ideas.md');
    expect(content).toContain('![s](./ideas-images/shot.png)');
    expect(content).toContain('![t](ideas-images/two.png)');
  });

  it('supports case-only renames', async () => {
    const root = await sample();
    expect(await renameEntry(root, 'b.txt', 'B.txt')).toBe('B.txt');
    expect((await fs.readdir(root)).includes('B.txt')).toBe(true);
  });

  it('refuses to overwrite and rolls back when the images folder name is taken', async () => {
    const root = await sample();
    await expect(renameEntry(root, 'notes.md', 'b.txt')).rejects.toMatchObject({ code: 'ALREADY_EXISTS' });
    await write(path.join(root, 'other-images', 'x.png'), PNG_1PX);
    await expect(renameEntry(root, 'notes.md', 'other.md')).rejects.toMatchObject({ code: 'ALREADY_EXISTS' });
    expect(await exists(path.join(root, 'notes.md'))).toBe(true);
    expect(await exists(path.join(root, 'notes-images', 'shot.png'))).toBe(true);
  });
});

describe('move', () => {
  it('moves a markdown file together with its images folder', async () => {
    const root = await sample();
    expect(await moveEntry(root, 'notes.md', 'guides')).toBe('guides/notes.md');
    expect(await exists(path.join(root, 'guides', 'notes-images', 'shot.png'))).toBe(true);
    expect(await readFile(root, 'guides/notes.md')).toContain('./notes-images/shot.png');
  });

  it('refuses to move a folder into itself', async () => {
    const root = await sample();
    await createDir(root, 'guides', 'sub');
    await expect(moveEntry(root, 'guides', 'guides/sub')).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});

describe('delete', () => {
  it('reports and optionally deletes the images folder', async () => {
    const root = await sample();
    expect(await entryInfo(root, 'notes.md')).toEqual({ exists: true, isDir: false, imagesDir: 'notes-images' });
    await deleteEntry(root, 'notes.md', true);
    expect(await exists(path.join(root, 'notes.md'))).toBe(false);
    expect(await exists(path.join(root, 'notes-images'))).toBe(false);
  });

  it('keeps the images folder when asked', async () => {
    const root = await sample();
    await deleteEntry(root, 'notes.md', false);
    expect(await exists(path.join(root, 'notes-images'))).toBe(true);
  });

  it('cannot delete the root', async () => {
    const root = await sample();
    await expect(deleteEntry(root, '', false)).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});
