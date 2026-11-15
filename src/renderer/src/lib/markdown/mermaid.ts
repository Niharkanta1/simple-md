type Mermaid = typeof import('mermaid').default;

let loader: Promise<Mermaid> | null = null;
let initializedTheme = '';
let counter = 0;
const cache = new Map<string, { svg?: string; error?: string }>();

function key(theme: string, src: string): string {
  return `${theme}\u0000${src}`;
}

async function getMermaid(theme: 'light' | 'dark'): Promise<Mermaid> {
  if (!loader) loader = import('mermaid').then((m) => m.default);
  const m = await loader;
  if (initializedTheme !== theme) {
    m.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: theme === 'dark' ? 'dark' : 'default',
      suppressErrorRendering: true,
      fontFamily: 'inherit'
    });
    initializedTheme = theme;
  }
  return m;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fill(block: HTMLElement, result: { svg?: string; error?: string }): void {
  if (result.svg) {
    block.innerHTML = result.svg;
    block.classList.remove('mermaid-failed');
  } else {
    block.innerHTML = `<div class="mermaid-error"><strong>Mermaid error</strong><pre>${escapeHtml(result.error ?? 'Unknown error')}</pre></div>`;
    block.classList.add('mermaid-failed');
  }
  block.dataset.rendered = '1';
}

function sourceOf(block: HTMLElement): string {
  try {
    return decodeURIComponent(block.dataset.src ?? '');
  } catch {
    return '';
  }
}

/** Synchronously fills blocks whose diagrams were rendered before (avoids flicker while typing). */
export function applyCachedDiagrams(container: HTMLElement, theme: 'light' | 'dark'): void {
  container.querySelectorAll<HTMLElement>('.mermaid-block').forEach((block) => {
    const hit = cache.get(key(theme, sourceOf(block)));
    if (hit) fill(block, hit);
  });
}

/** Renders any remaining diagrams. Loads Mermaid lazily on first use. */
export async function renderDiagrams(container: HTMLElement, theme: 'light' | 'dark'): Promise<void> {
  const pending = [...container.querySelectorAll<HTMLElement>('.mermaid-block:not([data-rendered])')];
  if (pending.length === 0) return;
  const m = await getMermaid(theme);
  for (const block of pending) {
    const src = sourceOf(block);
    const k = key(theme, src);
    let result = cache.get(k);
    if (!result) {
      const id = `mmd-${++counter}`;
      try {
        const { svg } = await m.render(id, src);
        result = { svg };
      } catch (e) {
        result = { error: e instanceof Error ? e.message : String(e) };
      } finally {
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
      }
      if (cache.size > 200) cache.clear();
      cache.set(k, result);
    }
    if (block.isConnected) fill(block, result);
  }
}
