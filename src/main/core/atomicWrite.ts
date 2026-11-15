import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export const TMP_SUFFIX = '.mdvtmp';

async function renameWithRetry(from: string, to: string): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException).code;
      // Windows: antivirus / indexer may briefly lock the target.
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') break;
      await new Promise((r) => setTimeout(r, 50 * (i + 1)));
    }
  }
  throw lastErr;
}

/** Writes via a temp file in the same folder followed by a rename. */
export async function atomicWrite(file: string, data: string | Uint8Array): Promise<void> {
  const dir = path.dirname(file);
  const tmp = path.join(dir, `.~${path.basename(file)}.${crypto.randomBytes(4).toString('hex')}${TMP_SUFFIX}`);
  await fs.writeFile(tmp, data);
  try {
    await renameWithRetry(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}
