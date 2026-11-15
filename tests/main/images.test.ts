import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  encodeLinkPath,
  findLocalReferences,
  importImageFile,
  rewriteImageLinks,
  savePastedImage,
  sniffImageExt
} from '../../src/main/services/images';
import { PNG_1PX, tmpDir, write } from '../helpers/tmp';

describe('rewriteImageLinks', () => {
  it('rewrites inline images with and without ./', () => {
    const src = '![a](./old-images/a.png)\n![b](old-images/b.png "title")\n';
    expect(rewriteImageLinks(src, 'old-images', 'new-images')).toBe('![a](./new-images/a.png)\n![b](new-images/b.png "title")\n');
  });

  it('rewrites angle-bracket, reference and HTML forms', () => {
    const src = [
      '![x](<./my notes-images/x y.png>)',
      '[ref]: ./my notes-images/r.png',
      '<img src="./my notes-images/h.png" width="20">',
      '![enc](./my%20notes-images/e.png)'
    ].join('\r\n');
    const out = rewriteImageLinks(src, 'my notes-images', 'ideas-images');
    expect(out).toBe(
      [
        '![x](<./ideas-images/x y.png>)',
        '[ref]: ./ideas-images/r.png',
        '<img src="./ideas-images/h.png" width="20">',
        '![enc](./ideas-images/e.png)'
      ].join('\r\n')
    );
  });

  it('leaves fenced code blocks and other folders untouched', () => {
    const src = '```md\n![a](./old-images/a.png)\n```\n![b](./older-images/b.png)\n![c](./x/old-images/c.png)\n';
    expect(rewriteImageLinks(src, 'old-images', 'new-images')).toBe(src);
  });

  it('encodes new folder names that need encoding', () => {
    const out = rewriteImageLinks('![e](./a%20b-images/e.png)', 'a b-images', 'c d-images');
    expect(out).toBe('![e](./c%20d-images/e.png)');
  });
});

describe('encodeLinkPath', () => {
  it('encodes spaces and parentheses per segment', () => {
    expect(encodeLinkPath('my notes-images/a (1).png')).toBe('my%20notes-images/a%20%281%29.png');
  });
});

describe('findLocalReferences', () => {
  it('finds relative references and skips URLs and code', () => {
    const md = [
      '![a](./a-images/1.png)',
      '![w](https://x.org/w.png)',
      '[doc](../other.md#sec)',
      '<img src="assets/p%20q.jpg">',
      '```',
      '![no](./code.png)',
      '```',
      '[r]: <./ref img.png>'
    ].join('\n');
    expect(findLocalReferences(md).sort()).toEqual(['../other.md', './a-images/1.png', './ref img.png', 'assets/p q.jpg'].sort());
  });
});

describe('savePastedImage', () => {
  it('saves into <stem>-images with a unique timestamped name', async () => {
    const root = await tmpDir();
    await write(path.join(root, 'docs', 'my notes.md'), '# hi');
    const l1 = await savePastedImage(root, 'docs/my notes.md', PNG_1PX, 'png');
    const l2 = await savePastedImage(root, 'docs/my notes.md', PNG_1PX, 'png');
    expect(l1).toMatch(/^\.\/my%20notes-images\/image-\d{8}-\d{6}\.png$/);
    expect(l2).not.toBe(l1);
    const files = await fs.readdir(path.join(root, 'docs', 'my notes-images'));
    expect(files).toHaveLength(2);
  });

  it('rejects data that is not an image', async () => {
    const root = await tmpDir();
    await write(path.join(root, 'a.md'), '');
    await expect(savePastedImage(root, 'a.md', Buffer.from('<script>alert(1)</script>'), 'png')).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT'
    });
  });

  it('rejects markdown paths outside the project', async () => {
    const root = await tmpDir();
    await expect(savePastedImage(root, '../x.md', PNG_1PX, 'png')).rejects.toMatchObject({ code: 'PATH_OUTSIDE_ROOT' });
  });

  it('sniffs formats', () => {
    expect(sniffImageExt(PNG_1PX)).toBe('png');
    expect(sniffImageExt(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe('jpg');
  });
});

describe('importImageFile', () => {
  it('copies an image and keeps its name, avoiding collisions', async () => {
    const root = await tmpDir();
    const ext = await tmpDir('mdv-ext-');
    await write(path.join(root, 'a.md'), '');
    await write(path.join(ext, 'photo.png'), PNG_1PX);
    const l1 = await importImageFile(root, 'a.md', path.join(ext, 'photo.png'));
    const l2 = await importImageFile(root, 'a.md', path.join(ext, 'photo.png'));
    expect(l1).toBe('./a-images/photo.png');
    expect(l2).toBe('./a-images/photo-1.png');
  });

  it('rejects non-image files', async () => {
    const root = await tmpDir();
    const ext = await tmpDir('mdv-ext-');
    await write(path.join(root, 'a.md'), '');
    await write(path.join(ext, 'evil.exe'), 'MZ');
    await expect(importImageFile(root, 'a.md', path.join(ext, 'evil.exe'))).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});
