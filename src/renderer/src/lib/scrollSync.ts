// Minimal one-way-at-a-time scroll sync between editor and preview (Split view).

type Target = (ratio: number) => void;

let toPreview: Target | null = null;
let toEditor: Target | null = null;
let lock: 'editor' | 'preview' | null = null;
let lockTimer: ReturnType<typeof setTimeout> | null = null;

function hold(source: 'editor' | 'preview') {
  lock = source;
  if (lockTimer) clearTimeout(lockTimer);
  lockTimer = setTimeout(() => (lock = null), 120);
}

export function registerPreview(fn: Target | null): void {
  toPreview = fn;
}
export function registerEditor(fn: Target | null): void {
  toEditor = fn;
}

export function editorScrolled(ratio: number): void {
  if (lock === 'preview') return;
  hold('editor');
  toPreview?.(ratio);
}

export function previewScrolled(ratio: number): void {
  if (lock === 'editor') return;
  hold('preview');
  toEditor?.(ratio);
}
