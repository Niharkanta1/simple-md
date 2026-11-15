import fs from 'node:fs/promises';

type TrashFn = (absPath: string) => Promise<void>;

// Default used in tests (and as a fallback): permanent removal.
// The Electron entry point replaces this with shell.trashItem (Recycle Bin).
let impl: TrashFn = async (p) => {
  await fs.rm(p, { recursive: true, force: true });
};

export function setTrashImpl(fn: TrashFn): void {
  impl = fn;
}

export function moveToTrash(absPath: string): Promise<void> {
  return impl(absPath);
}
