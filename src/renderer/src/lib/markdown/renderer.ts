import { Marked, type Tokens } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';

/** GitHub-style heading slug. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

export function createMarkdownRenderer(): (src: string) => string {
  const slugCounts = new Map<string, number>();

  const marked = new Marked(
    { gfm: true, breaks: false },
    markedHighlight({
      emptyLangClass: 'hljs',
      langPrefix: 'hljs language-',
      highlight(code, lang) {
        const l = (lang || '').trim().split(/\s+/)[0].toLowerCase();
        if (l && l !== 'mermaid' && hljs.getLanguage(l)) {
          try {
            return hljs.highlight(code, { language: l, ignoreIllegals: true }).value;
          } catch {
            /* fall through */
          }
        }
        return code;
      }
    }),
    {
      renderer: {
        code(token: Tokens.Code) {
          if ((token.lang || '').trim().toLowerCase() === 'mermaid') {
            return `<div class="mermaid-block" data-src="${escapeAttr(encodeURIComponent(token.text))}"></div>\n`;
          }
          return false;
        },
        heading(token: Tokens.Heading) {
          const inner = this.parser.parseInline(token.tokens);
          let slug = slugify(token.text) || 'section';
          const n = slugCounts.get(slug) ?? 0;
          slugCounts.set(slug, n + 1);
          if (n) slug = `${slug}-${n}`;
          return `<h${token.depth} id="${escapeAttr(slug)}">${inner}</h${token.depth}>\n`;
        }
      }
    }
  );

  return (src: string) => {
    slugCounts.clear();
    const html = marked.parse(src, { async: false }) as string;
    return DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true, svg: true },
      FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed', 'base', 'meta', 'link'],
      FORBID_ATTR: ['srcset', 'formaction'],
      ADD_ATTR: ['data-src']
    });
  };
}
