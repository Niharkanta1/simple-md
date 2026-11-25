import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scoreDocument, searchProject, tokenize } from '../../src/main/services/search';
import { tmpDir, write } from '../helpers/tmp';

describe('tokenize', () => {
  it('splits on whitespace, lower-cases and de-duplicates', () => {
    expect(tokenize('  Alpha beta ALPHA  ')).toEqual(['alpha', 'beta']);
  });
  it('keeps quoted phrases together', () => {
    expect(tokenize('"Hello   World" foo')).toEqual(['hello world', 'foo']);
  });
  it('handles an unterminated quote and empty input', () => {
    expect(tokenize('"open phrase')).toEqual(['open phrase']);
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize('""')).toEqual([]);
  });
});

describe('scoreDocument', () => {
  it('requires every token', () => {
    expect(scoreDocument('a.md', 'apple banana', ['apple', 'cherry'])).toBeNull();
    expect(scoreDocument('cherry.md', 'apple banana', ['apple', 'cherry'])).not.toBeNull();
  });
  it('returns line snippets for matches', () => {
    const r = scoreDocument('a.md', '# Title\n\nsome apple here\nnothing\nApple again', ['apple'])!;
    expect(r.matches).toBe(2);
    expect(r.snippets.map((s) => s.line)).toEqual([3, 5]);
  });
});

describe('searchProject', () => {
  async function sample(): Promise<string> {
    const root = await tmpDir();
    await write(path.join(root, '.mdviewer', 'project.json'), '{"x":"apple"}');
    await write(path.join(root, 'apple.md'), '# Apple\n\nAll about apples and pie.');
    await write(path.join(root, 'notes', 'fruit.md'), 'I like an apple. apple apple. Banana too.');
    await write(path.join(root, 'notes', 'veg.md'), 'Carrots only.');
    await write(path.join(root, 'code.js'), 'const apple = 1;');
    return root;
  }

  it('returns only documents matching all tokens, best first', async () => {
    const root = await sample();
    const res = await searchProject(root, 'apple');
    expect(res.tokens).toEqual(['apple']);
    expect(res.results.map((r) => r.path)).toEqual(['apple.md', 'notes/fruit.md']);
    expect(res.searched).toBe(3);

    const both = await searchProject(root, 'apple banana');
    expect(both.results.map((r) => r.path)).toEqual(['notes/fruit.md']);
  });

  it('returns nothing for an empty query', async () => {
    const root = await sample();
    const res = await searchProject(root, '   ');
    expect(res.results).toEqual([]);
    expect(res.searched).toBe(0);
  });
});
