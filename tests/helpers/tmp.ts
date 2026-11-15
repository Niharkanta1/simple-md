import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { loadConfig } from '../../src/main/core/config';

const created: string[] = [];

/** Creates a fresh temp directory that is removed after each test. */
export async function tmpDir(prefix = 'mdv-'): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

/** Fresh temp dir + a fresh app config stored inside it. */
export async function tmpWorkspace(): Promise<{ dir: string; cfgDir: string }> {
  const dir = await tmpDir();
  const cfgDir = path.join(dir, '_config');
  await loadConfig(cfgDir);
  return { dir, cfgDir };
}

export async function write(file: string, content: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p);
    return true;
  } catch {
    return false;
  }
}

/** A tiny valid 1x1 PNG. */
export const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

afterEach(async () => {
  while (created.length) {
    const d = created.pop()!;
    await fs.rm(d, { recursive: true, force: true }).catch(() => {});
  }
});
