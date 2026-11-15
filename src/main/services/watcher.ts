import { watch, type FSWatcher } from 'node:fs';
import { TMP_SUFFIX } from '../core/atomicWrite';

let current: { id: string; watcher: FSWatcher } | null = null;
let timer: NodeJS.Timeout | null = null;

function ignored(file: string | null): boolean {
  if (!file) return false;
  const f = file.replace(/\\/g, '/');
  return (
    f.startsWith('.git/') ||
    f === '.git' ||
    f.startsWith('.mdviewer/') ||
    f.startsWith('.mdviewer-tmp-') ||
    f.endsWith(TMP_SUFFIX)
  );
}

/** Watches one project folder at a time; calls onChange (debounced) on external changes. */
export function watchProject(id: string, root: string, onChange: (id: string) => void): void {
  if (current?.id === id) return;
  stopWatching();
  try {
    const watcher = watch(root, { recursive: true }, (_event, file) => {
      if (ignored(typeof file === 'string' ? file : null)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChange(id), 300);
    });
    watcher.on('error', () => stopWatching());
    current = { id, watcher };
  } catch {
    current = null;
  }
}

export function stopWatching(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  current?.watcher.close();
  current = null;
}
