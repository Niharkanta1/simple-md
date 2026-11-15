// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createMarkdownRenderer, slugify } from '../../src/renderer/src/lib/markdown/renderer';
import { classifyLink, rewriteImages } from '../../src/renderer/src/lib/markdown/links';
import { fileKind, remap, resolveRelative } from '../../src/renderer/src/lib/util/paths';

const render = createMarkdownRenderer();

describe('markdown renderer (GFM)', () => {
  it('renders tables, task lists, strikethrough and autolinks', () => {
    const html = render(
      ['| A | B |', '|---|:-:|', '| 1 | 2 |', '', '- [x] done', '- [ ] todo', '', '~~old~~ www.example.com'].join('\n')
    );
    expect(html).toContain('<table>');
    expect(html).toContain('<th align="center">B</th>');
    expect(html).toMatch(/<input[^>]*checked[^>]*type="checkbox"|<input[^>]*type="checkbox"[^>]*checked/);
    expect(html).toContain('<del>old</del>');
    expect(html).toContain('href="http://www.example.com"');
  });

  it('highlights fenced code and keeps unknown languages escaped', () => {
    const html = render('```js\nconst a = 1;\n```\n\n```nope\n<b>x</b>\n```');
    expect(html).toContain('class="hljs language-js"');
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('turns mermaid blocks into placeholders', () => {
    const html = render('```mermaid\ngraph TD; A-->B;\n```');
    expect(html).toContain('class="mermaid-block"');
    expect(html).toContain(`data-src="${encodeURIComponent('graph TD; A-->B;')}"`);
  });

  it('adds GitHub-style heading ids with de-duplication', () => {
    const html = render('# Hello World!\n\n## Hello World!');
    expect(html).toContain('<h1 id="hello-world">');
    expect(html).toContain('<h2 id="hello-world-1">');
    expect(slugify('Ünïcode Title 2')).toBe('ünïcode-title-2');
  });

  it('renders blockquotes and nested lists', () => {
    const html = render('> quote\n\n1. one\n   - nested');
    expect(html).toContain('<blockquote>');
    expect(html).toMatch(/<ol>[\s\S]*<ul>[\s\S]*nested/);
  });

  it('sanitises dangerous HTML', () => {
    const html = render(
      '<script>alert(1)</script>\n\n<img src="x.png" onerror="alert(2)">\n\n[x](javascript:alert(3))\n\n<iframe src="https://evil"></iframe>'
    );
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<iframe');
  });
});

describe('links', () => {
  it('classifies link targets', () => {
    expect(classifyLink('https://a.com', 'a.md')).toEqual({ type: 'external', url: 'https://a.com' });
    expect(classifyLink('mailto:a@b.c', 'a.md').type).toBe('external');
    expect(classifyLink('#sec', 'a.md')).toEqual({ type: 'anchor', id: 'sec' });
    expect(classifyLink('../b.md#x', 'docs/a.md')).toEqual({ type: 'file', path: 'b.md', anchor: 'x' });
    expect(classifyLink('other%20file.md', 'docs/a.md')).toEqual({ type: 'file', path: 'docs/other file.md', anchor: null });
    expect(classifyLink('javascript:alert(1)', 'a.md').type).toBe('blocked');
    expect(classifyLink('file:///C:/x', 'a.md').type).toBe('blocked');
    expect(classifyLink('../../x.md', 'a.md').type).toBe('blocked');
  });

  it('rewrites relative images to the mdimg protocol', () => {
    const el = document.createElement('div');
    el.innerHTML =
      '<img src="./a-images/x%20y.png"><img src="https://w/x.png"><img src="../../out.png"><img src="file:///C:/x.png">';
    rewriteImages(el, 'pid', 'docs/a.md');
    const imgs = el.querySelectorAll('img');
    expect(imgs[0].getAttribute('src')).toBe('mdimg://pid/docs/a-images/x%20y.png');
    expect(imgs[1].getAttribute('src')).toBe('https://w/x.png');
    expect(imgs[2].hasAttribute('src')).toBe(false);
    expect(imgs[3].hasAttribute('src')).toBe(false);
  });
});

describe('path helpers', () => {
  it('resolves and remaps', () => {
    expect(resolveRelative('a/b/c.md', '../d.png')).toBe('a/d.png');
    expect(resolveRelative('c.md', '../d.png')).toBeNull();
    expect(remap('a/b/c.md', 'a/b', 'x')).toBe('x/c.md');
    expect(remap('a/bc.md', 'a/b', 'x')).toBe('a/bc.md');
  });
  it('classifies files', () => {
    expect(fileKind('a.MD')).toBe('markdown');
    expect(fileKind('a.png')).toBe('image');
    expect(fileKind('.gitignore')).toBe('text');
    expect(fileKind('notes.txt')).toBe('text');
    expect(fileKind('app.exe')).toBe('other');
  });
});
