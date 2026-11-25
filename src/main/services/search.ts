import fs from 'node:fs/promises';
import path from 'node:path';
import type { SearchHit, SearchResponse, SearchSnippet, TreeNode } from '../../shared/types';
import { tokenize } from '../../shared/search';
import { listTree } from './fsOps';

export { tokenize };

/** Files larger than this are skipped by the search. */
export const MAX_SEARCH_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_SEARCH_RESULTS = 100;
const MAX_SNIPPETS = 3;
const SNIPPET_CHARS = 160;

const SEARCHABLE = /\.(md|markdown|mdown|mkd|txt)$/i;

function countOccurrences(haystack: string, needle: string): number {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

function collectFiles(node: TreeNode, out: string[]): string[] {
  for (const c of node.children ?? []) {
    if (c.type === 'dir') collectFiles(c, out);
    else if (SEARCHABLE.test(c.name)) out.push(c.path);
  }
  return out;
}

/** Builds up to MAX_SNIPPETS line snippets, preferring lines with the most distinct tokens. */
function buildSnippets(content: string, tokens: string[]): SearchSnippet[] {
  const lines = content.split(/\r?\n/);
  const candidates: { line: number; text: string; hits: number; matched: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lower = lines[i].toLowerCase();
    let matched = 0;
    let hits = 0;
    for (const t of tokens) {
      const c = countOccurrences(lower, t);
      if (c) {
        matched++;
        hits += c;
      }
    }
    if (matched) candidates.push({ line: i + 1, text: lines[i], hits, matched });
  }
  candidates.sort((a, b) => b.matched - a.matched || b.hits - a.hits || a.line - b.line);
  return candidates
    .slice(0, MAX_SNIPPETS)
    .sort((a, b) => a.line - b.line)
    .map(({ line, text }) => ({ line, text: trimAround(text, tokens) }));
}

/** Shortens a long line to a window around its first token match. */
function trimAround(text: string, tokens: string[]): string {
  const clean = text.replace(/\t/g, ' ');
  if (clean.length <= SNIPPET_CHARS) return clean.trim();
  const lower = clean.toLowerCase();
  let first = clean.length;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i !== -1 && i < first) first = i;
  }
  const start = Math.max(0, Math.min(first - 40, clean.length - SNIPPET_CHARS));
  const end = Math.min(clean.length, start + SNIPPET_CHARS);
  return `${start > 0 ? '…' : ''}${clean.slice(start, end).trim()}${end < clean.length ? '…' : ''}`;
}

/** Scores one document. Returns null unless every token appears in its name/path or content. */
export function scoreDocument(rel: string, content: string, tokens: string[]): Omit<SearchHit, 'path'> | null {
  const lowerContent = content.toLowerCase();
  const lowerPath = rel.toLowerCase();
  const lowerName = path.posix.basename(lowerPath);
  const headings = content
    .split(/\r?\n/)
    .filter((l) => /^\s{0,3}#{1,6}\s/.test(l))
    .join('\n')
    .toLowerCase();

  let score = 0;
  let total = 0;
  const counts: Record<string, number> = {};
  for (const t of tokens) {
    const inContent = countOccurrences(lowerContent, t);
    const inName = lowerName.includes(t);
    const inPath = lowerPath.includes(t);
    if (!inContent && !inPath) return null; // every token must match
    counts[t] = inContent;
    total += inContent;
    // Diminishing returns for repeated hits, strong boosts for names and headings.
    score += Math.log2(1 + inContent) * 2;
    if (inName) score += 8;
    else if (inPath) score += 3;
    if (headings.includes(t)) score += 4;
  }
  // All tokens adjacent as a phrase is a strong relevance signal.
  if (tokens.length > 1 && lowerContent.includes(tokens.join(' '))) score += 6;
  // Prefer focused documents slightly over very long ones.
  score -= Math.min(2, content.length / 200_000);

  return { score: Math.round(score * 100) / 100, matches: total, tokenCounts: counts, snippets: buildSnippets(content, tokens) };
}

/** Full-text search over the Markdown and text files of a project. */
export async function searchProject(root: string, query: string): Promise<SearchResponse> {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { tokens, results: [], searched: 0, truncated: false };
  const files = collectFiles(await listTree(root), []);
  const hits: SearchHit[] = [];
  let searched = 0;
  for (const rel of files) {
    const abs = path.join(root, ...rel.split('/'));
    let content: string;
    try {
      const st = await fs.stat(abs);
      if (!st.isFile() || st.size > MAX_SEARCH_FILE_BYTES) continue;
      content = await fs.readFile(abs, 'utf8');
    } catch {
      continue;
    }
    searched++;
    const scored = scoreDocument(rel, content, tokens);
    if (scored) hits.push({ path: rel, ...scored });
  }
  hits.sort((a, b) => b.score - a.score || b.matches - a.matches || a.path.localeCompare(b.path));
  return {
    tokens,
    results: hits.slice(0, MAX_SEARCH_RESULTS),
    searched,
    truncated: hits.length > MAX_SEARCH_RESULTS
  };
}
