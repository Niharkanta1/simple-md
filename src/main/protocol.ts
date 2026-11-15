import { protocol } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveInProject } from './core/pathGuard';
import { getProjectRoot } from './services/project';

export const IMAGE_SCHEME = 'mdimg';

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  ico: 'image/x-icon'
};

/** Must run before app 'ready'. */
export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: IMAGE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
  ]);
}

/**
 * Serves `mdimg://<projectId>/<project-relative path>`. Only image files
 * inside a registered project's root are served.
 */
export function registerImageProtocol(): void {
  protocol.handle(IMAGE_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const projectId = url.hostname;
      const rel = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const ext = path.extname(rel).slice(1).toLowerCase();
      const mime = MIME[ext];
      if (!mime) return new Response('Unsupported type', { status: 415 });
      const root = await getProjectRoot(projectId);
      const abs = await resolveInProject(root, rel);
      const data = await fs.readFile(abs);
      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff',
          ...(ext === 'svg' ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" } : {})
        }
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}
