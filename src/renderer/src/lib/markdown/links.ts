import { encodePath, resolveRelative } from '../util/paths';

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i;

/** Rewrites relative <img src> values to the app's mdimg:// protocol. */
export function rewriteImages(container: HTMLElement, projectId: string, docPath: string): void {
  container.querySelectorAll('img').forEach((img) => {
    const raw = img.getAttribute('src') ?? '';
    if (!raw || /^(https?:|data:|mdimg:|blob:)/i.test(raw)) return;
    if (ABSOLUTE_URL.test(raw) || raw.startsWith('/') || raw.startsWith('\\')) {
      img.removeAttribute('src');
      img.title = `Blocked: ${raw} (use a relative path inside the project)`;
      img.classList.add('img-missing');
      return;
    }
    const target = raw.split('#')[0].split('?')[0];
    const rel = resolveRelative(docPath, target);
    if (rel === null) {
      img.removeAttribute('src');
      img.title = `Outside the project: ${raw}`;
      img.classList.add('img-missing');
      return;
    }
    img.src = `mdimg://${projectId}/${encodePath(rel)}`;
    img.loading = 'lazy';
    img.addEventListener('error', () => img.classList.add('img-missing'), { once: true });
  });
}

export type LinkAction =
  | { type: 'external'; url: string }
  | { type: 'anchor'; id: string }
  | { type: 'file'; path: string; anchor: string | null }
  | { type: 'blocked'; reason: string };

/** Decides what a click on a link in the preview should do. */
export function classifyLink(href: string, docPath: string): LinkAction {
  const h = href.trim();
  if (!h) return { type: 'blocked', reason: 'Empty link' };
  if (h.startsWith('#')) {
    let id = h.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      /* keep */
    }
    return { type: 'anchor', id };
  }
  if (/^(https?|mailto):/i.test(h)) return { type: 'external', url: h };
  if (ABSOLUTE_URL.test(h) || h.startsWith('/') || h.startsWith('\\')) {
    return { type: 'blocked', reason: `Blocked link: ${h}` };
  }
  const [pathPart, ...rest] = h.split('#');
  const anchor = rest.length ? rest.join('#') : null;
  const rel = resolveRelative(docPath, pathPart.split('?')[0]);
  if (rel === null) return { type: 'blocked', reason: 'Link points outside the project.' };
  if (rel === '' || rel === docPath) return anchor ? { type: 'anchor', id: anchor } : { type: 'blocked', reason: '' };
  return { type: 'file', path: rel, anchor };
}
