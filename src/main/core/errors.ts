import type { ErrorCode, ErrorPayload } from '../../shared/types';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toErrorPayload(err: unknown): ErrorPayload {
  if (err instanceof AppError) return { code: err.code, message: err.message };
  const e = err as NodeJS.ErrnoException | undefined;
  if (e && typeof e === 'object' && typeof e.code === 'string') {
    switch (e.code) {
      case 'ENOENT':
        return { code: 'NOT_FOUND', message: 'File or folder not found.' };
      case 'EEXIST':
        return { code: 'ALREADY_EXISTS', message: 'A file or folder with that name already exists.' };
      case 'EPERM':
      case 'EACCES':
      case 'EBUSY':
        return { code: 'IO', message: `Access denied or file in use (${e.code}).` };
      case 'ENOTEMPTY':
        return { code: 'IO', message: 'Folder is not empty.' };
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  return { code: 'IO', message };
}

export function isErrno(err: unknown, code: string): boolean {
  return !!err && typeof err === 'object' && (err as NodeJS.ErrnoException).code === code;
}
