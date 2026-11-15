import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import yauzl from 'yauzl';
import { exportFile, exportProject, importIntoProject, importZipAsProject, DEFAULT_LIMITS } from '../../src/main/services/archive';
import { createProject } from '../../src/main/services/project';
import { getConfig } from '../../src/main/core/config';
import { setGitignore } from '../../src/main/services/gitignore';
import { buildZip } from '../helpers/zipBuilder';
import { exists, PNG_1PX, tmpDir, tmpWorkspace, write } from '../helpers/tmp';

async function hashTree(root: string, rel = ''): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const d of await fs.readdir(path.join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${d.name}` : d.name;
    if (d.isDirectory()) Object.assign(out, await hashTree(root, r));
    else out[r] = crypto.createHash('sha256').update(await fs.readFile(path.join(root, r))).digest('hex');
  }
  return out;
}

function zipNames(file: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err);
      const names: string[] = [];
      zip.on('entry', (e: yauzl.Entry) => {
        names.push(e.fileName);
        zip.readEntry();
      });
      zip.on('end', () => resolve(names.sort()));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}

async function sampleProject(dir: string) {
  const p = await createProject(dir, 'Source');
  const root = p.rootPath;
  await write(path.join(root, 'guides', 'setup.md'), '# Setup\n\n![s](./setup-images/s.png)\n![shared](../assets/logo.png)\n![web](https://example.com/x.png)\n');
  await write(path.join(root, 'guides', 'setup-images', 's.png'), PNG_1PX);
  await write(path.join(root, 'assets', 'logo.png'), PNG_1PX);
  await write(path.join(root, 'assets', 'unused.png'), PNG_1PX);
  await write(path.join(root, 'debug.log'), 'log');
  await fs.mkdir(path.join(root, 'empty-folder'));
  await setGitignore(root, '*.log\n');
  return p;
}

describe('export', () => {
  it('exports a whole project including metadata and empty folders', async () => {
    const { dir } = await tmpWorkspace();
    const p = await sampleProject(dir);
    const zip = path.join(dir, 'out.zip');
    const s = await exportProject(p.rootPath, zip, false);
    const names = await zipNames(zip);
    expect(names).toContain('.mdviewer/project.json');
    expect(names).toContain('guides/setup-images/s.png');
    expect(names).toContain('debug.log');
    expect(names).toContain('empty-folder/');
    expect(s.files).toBe(names.filter((n) => !n.endsWith('/')).length);
  });

  it('can respect .gitignore', async () => {
    const { dir } = await tmpWorkspace();
    const p = await sampleProject(dir);
    const zip = path.join(dir, 'out.zip');
    const s = await exportProject(p.rootPath, zip, true);
    const names = await zipNames(zip);
    expect(names).not.toContain('debug.log');
    expect(names).toContain('.gitignore');
    expect(s.skipped).toContain('debug.log');
  });

  it('exports a single file with its images and referenced images (paths preserved)', async () => {
    const { dir } = await tmpWorkspace();
    const p = await sampleProject(dir);
    const zip = path.join(dir, 'file.zip');
    await exportFile(p.rootPath, 'guides/setup.md', zip);
    expect(await zipNames(zip)).toEqual(['assets/logo.png', 'guides/setup-images/s.png', 'guides/setup.md']);
  });
});

describe('import as project', () => {
  it('round-trips byte-identical files, registers with a new id', async () => {
    const { dir } = await tmpWorkspace();
    const p = await sampleProject(dir);
    const zip = path.join(dir, 'roundtrip.zip');
    await exportProject(p.rootPath, zip, false);

    const dest = path.join(dir, 'dest');
    await fs.mkdir(dest);
    const s = await importZipAsProject(zip, dest);
    expect(s.project).toBeTruthy();
    expect(s.project!.id).not.toBe(p.id);
    expect(s.project!.rootPath).toBe(path.join(dest, 'Source'));
    expect(getConfig().projects.map((x) => x.id)).toContain(s.project!.id);

    const a = await hashTree(p.rootPath);
    const b = await hashTree(s.project!.rootPath);
    delete a['.mdviewer/project.json'];
    delete b['.mdviewer/project.json'];
    expect(b).toEqual(a);
    expect(await exists(path.join(s.project!.rootPath, 'empty-folder'))).toBe(true);
    // No temp folders left behind
    expect((await fs.readdir(dest)).filter((n) => n.startsWith('.mdviewer-tmp'))).toEqual([]);
  });

  it('resolves name conflicts and strips a single top-level folder', async () => {
    const { dir } = await tmpWorkspace();
    const dest = await tmpDir('mdv-dest-');
    await fs.mkdir(path.join(dest, 'Notes'));
    const zip = path.join(dir, 'Notes.zip');
    await fs.writeFile(zip, buildZip([{ name: 'Notes/' }, { name: 'Notes/a.md', data: Buffer.from('# A') }]));
    const s = await importZipAsProject(zip, dest);
    expect(s.project!.rootPath).toBe(path.join(dest, 'Notes (2)'));
    expect(await fs.readFile(path.join(dest, 'Notes (2)', 'a.md'), 'utf8')).toBe('# A');
  });
});

describe('import into project', () => {
  it('copies a .md file with a unique name', async () => {
    const { dir } = await tmpWorkspace();
    const p = await createProject(dir, 'P');
    const ext = await tmpDir('mdv-ext-');
    await write(path.join(ext, 'README.md'), 'outside');
    const s = await importIntoProject(p.rootPath, '', path.join(ext, 'README.md'));
    expect(s.targetPath).toBe('README (2).md');
  });

  it('extracts a zip into the folder and never imports project metadata', async () => {
    const { dir } = await tmpWorkspace();
    const p = await createProject(dir, 'P');
    await fs.mkdir(path.join(p.rootPath, 'inbox'));
    const zip = path.join(dir, 'pack.zip');
    await fs.writeFile(
      zip,
      buildZip([
        { name: '.mdviewer/project.json', data: Buffer.from('{"id":"x"}') },
        { name: 'doc.md', data: Buffer.from('# doc') },
        { name: 'doc-images/i.png', data: PNG_1PX }
      ])
    );
    const s = await importIntoProject(p.rootPath, 'inbox', zip);
    expect(await exists(path.join(p.rootPath, 'inbox', 'doc.md'))).toBe(true);
    expect(await exists(path.join(p.rootPath, 'inbox', 'doc-images', 'i.png'))).toBe(true);
    expect(await exists(path.join(p.rootPath, 'inbox', '.mdviewer'))).toBe(false);
    expect(s.warnings.length).toBeGreaterThan(0);
    // Second import conflicts -> placed in its own folder
    const s2 = await importIntoProject(p.rootPath, 'inbox', zip);
    expect(s2.targetPath).toBe('inbox/pack');
  });
});

describe('zip security', () => {
  const cases: [string, Parameters<typeof buildZip>[0], string][] = [
    ['zip-slip ../', [{ name: '../evil.txt', data: Buffer.from('x') }], 'ZIP_INVALID'],
    ['nested zip-slip', [{ name: 'ok/../../evil.txt', data: Buffer.from('x') }], 'ZIP_INVALID'],
    ['absolute path', [{ name: '/evil.txt', data: Buffer.from('x') }], 'ZIP_INVALID'],
    ['drive letter', [{ name: 'C:/evil.txt', data: Buffer.from('x') }], 'ZIP_INVALID'],
    ['backslash traversal', [{ name: '..\\evil.txt', data: Buffer.from('x') }], 'ZIP_INVALID'],
    ['reserved name', [{ name: 'CON', data: Buffer.from('x') }], 'ZIP_INVALID'],
    ['alternate data stream', [{ name: 'a.md:hidden', data: Buffer.from('x') }], 'ZIP_INVALID'],
    ['symlink entry', [{ name: 'link', data: Buffer.from('/etc/passwd'), unixMode: 0o120777 }], 'ZIP_INVALID'],
    ['encrypted entry', [{ name: 'a.md', data: Buffer.from('x'), flags: 1 }], 'ZIP_INVALID'],
    [
      'duplicate names',
      [
        { name: 'a.md', data: Buffer.from('1') },
        { name: 'A.md', data: Buffer.from('2') }
      ],
      'ZIP_INVALID'
    ],
    ['zip bomb ratio', [{ name: 'bomb.txt', data: Buffer.alloc(8 * 1024 * 1024), deflate: true }], 'ZIP_LIMIT'],
    ['lying size header', [{ name: 'a.txt', data: Buffer.alloc(5000, 1), declaredSize: 10 }], 'ZIP_INVALID']
  ];

  it.each(cases)('rejects %s and writes nothing', async (_label, entries, code) => {
    const { dir } = await tmpWorkspace();
    const dest = path.join(dir, 'dest');
    await fs.mkdir(dest);
    const zip = path.join(dir, 'bad.zip');
    await fs.writeFile(zip, buildZip(entries));
    await expect(importZipAsProject(zip, dest)).rejects.toMatchObject({ code });
    expect(await fs.readdir(dest)).toEqual([]);
    expect(await exists(path.join(dir, 'evil.txt'))).toBe(false);
    expect(getConfig().projects).toHaveLength(0);
  });

  it('enforces entry-count and total-size limits', async () => {
    const { dir } = await tmpWorkspace();
    const dest = path.join(dir, 'dest');
    await fs.mkdir(dest);
    const many = path.join(dir, 'many.zip');
    await fs.writeFile(many, buildZip(Array.from({ length: 6 }, (_, i) => ({ name: `f${i}.md`, data: Buffer.from('x') }))));
    await expect(importZipAsProject(many, dest, { ...DEFAULT_LIMITS, maxEntries: 5 })).rejects.toMatchObject({ code: 'ZIP_LIMIT' });
    const big = path.join(dir, 'big.zip');
    await fs.writeFile(big, buildZip([{ name: 'a.bin', data: Buffer.alloc(800) }, { name: 'b.bin', data: Buffer.alloc(800) }]));
    await expect(importZipAsProject(big, dest, { ...DEFAULT_LIMITS, maxTotalBytes: 1000 })).rejects.toMatchObject({ code: 'ZIP_LIMIT' });
    expect(await fs.readdir(dest)).toEqual([]);
  });

  it('rejects files that are not zips and empty archives', async () => {
    const { dir } = await tmpWorkspace();
    const dest = path.join(dir, 'dest');
    await fs.mkdir(dest);
    const notZip = path.join(dir, 'x.zip');
    await fs.writeFile(notZip, 'hello');
    await expect(importZipAsProject(notZip, dest)).rejects.toMatchObject({ code: 'ZIP_INVALID' });
    const empty = path.join(dir, 'empty.zip');
    await fs.writeFile(empty, buildZip([]));
    await expect(importZipAsProject(empty, dest)).rejects.toMatchObject({ code: 'ZIP_INVALID' });
    expect(await fs.readdir(dest)).toEqual([]);
  });

  it('rejects zip-slip when importing into a project, leaving the project untouched', async () => {
    const { dir } = await tmpWorkspace();
    const p = await createProject(dir, 'P');
    const before = await hashTree(p.rootPath);
    const zip = path.join(dir, 'bad.zip');
    await fs.writeFile(zip, buildZip([{ name: 'ok.md', data: Buffer.from('ok') }, { name: '../../escape.md', data: Buffer.from('x') }]));
    await expect(importIntoProject(p.rootPath, '', zip)).rejects.toMatchObject({ code: 'ZIP_INVALID' });
    expect(await hashTree(p.rootPath)).toEqual(before);
    expect(await exists(path.join(dir, 'escape.md'))).toBe(false);
  });
});
