import { ui, type DialogRequest, type MenuItem, type Toast } from './state.svelte';
import { errorMessage } from './api';

let toastId = 0;

export function toast(message: string, kind: Toast['kind'] = 'info', action?: Toast['action']): void {
  const id = ++toastId;
  ui.toasts = [...ui.toasts, { id, kind, message, action }];
  const ttl = kind === 'error' ? 7000 : action ? 9000 : 3500;
  setTimeout(() => dismissToast(id), ttl);
}

export function dismissToast(id: number): void {
  ui.toasts = ui.toasts.filter((t) => t.id !== id);
}

export function showError(err: unknown): void {
  toast(errorMessage(err), 'error');
}

function open(req: DialogRequest): void {
  // Only one dialog at a time: cancel any previous one.
  ui.dialog?.resolve(null);
  ui.dialog = req;
}

export function prompt(opts: {
  title: string;
  message?: string;
  value?: string;
  placeholder?: string;
  okLabel?: string;
  danger?: boolean;
  selectStem?: boolean;
  validate?: (v: string) => string | null;
}): Promise<string | null> {
  return new Promise((resolve) =>
    open({ kind: 'prompt', value: '', okLabel: 'OK', ...opts, resolve })
  );
}

export function choose(opts: {
  title: string;
  message: string;
  buttons: { label: string; value: string; variant?: 'primary' | 'danger' | 'default' }[];
}): Promise<string | null> {
  return new Promise((resolve) => open({ kind: 'choice', ...opts, resolve }));
}

export async function confirm(opts: { title: string; message: string; okLabel?: string; danger?: boolean }): Promise<boolean> {
  const v = await choose({
    title: opts.title,
    message: opts.message,
    buttons: [
      { label: 'Cancel', value: 'cancel' },
      { label: opts.okLabel ?? 'OK', value: 'ok', variant: opts.danger ? 'danger' : 'primary' }
    ]
  });
  return v === 'ok';
}

export function openMenu(e: MouseEvent, items: MenuItem[]): void {
  e.preventDefault();
  e.stopPropagation();
  ui.menu = { x: e.clientX, y: e.clientY, items };
}

export function openMenuAt(x: number, y: number, items: MenuItem[]): void {
  ui.menu = { x, y, items };
}

export function closeMenu(): void {
  ui.menu = null;
}
