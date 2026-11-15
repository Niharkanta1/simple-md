const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
// eslint-disable-next-line no-control-regex
const INVALID = /[<>:"/\\|?*\u0000-\u001f]/;

/** Client-side mirror of the main-process name validation (for instant feedback). */
export function nameProblem(name: string): string | null {
  if (!name) return 'Name cannot be empty.';
  if (name.trim() !== name) return 'Name cannot start or end with spaces.';
  if (name === '.' || name === '..') return 'Invalid name.';
  if (name.length > 255) return 'Name is too long.';
  if (INVALID.test(name)) return 'Name cannot contain < > : " / \\ | ? *';
  if (name.endsWith('.')) return 'Name cannot end with a dot.';
  if (RESERVED.test(name)) return `"${name}" is a reserved name on Windows.`;
  return null;
}
