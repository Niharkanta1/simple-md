// Search query tokenizing, shared by main (search service) and renderer (token chips).

export const MAX_SEARCH_TOKENS = 12;

/**
 * Splits a query into search tokens. Words are separated by whitespace;
 * "double quoted" text is kept together as one phrase token. Tokens are
 * lower-cased, de-duplicated and limited to MAX_SEARCH_TOKENS.
 */
export function tokenize(query: string): string[] {
  if (typeof query !== 'string') return [];
  const out: string[] = [];
  const re = /"([^"]*)"?|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) !== null) {
    const raw = (m[1] ?? m[2] ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (raw && !out.includes(raw)) out.push(raw);
    if (out.length >= MAX_SEARCH_TOKENS) break;
  }
  return out;
}

/** Turns tokens back into a query string (phrases are quoted). */
export function joinTokens(tokens: string[]): string {
  return tokens.map((t) => (/\s/.test(t) ? `"${t}"` : t)).join(' ');
}
