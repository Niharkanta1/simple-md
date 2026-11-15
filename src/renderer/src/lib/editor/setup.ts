import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { tags as t } from '@lezer/highlight';

const highlight = HighlightStyle.define([
  { tag: t.heading1, fontWeight: '700', fontSize: '1.35em', color: 'var(--cm-heading)' },
  { tag: t.heading2, fontWeight: '700', fontSize: '1.2em', color: 'var(--cm-heading)' },
  { tag: t.heading3, fontWeight: '700', fontSize: '1.1em', color: 'var(--cm-heading)' },
  { tag: [t.heading4, t.heading5, t.heading6], fontWeight: '700', color: 'var(--cm-heading)' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: [t.link, t.url], color: 'var(--cm-link)' },
  { tag: t.monospace, color: 'var(--cm-code)', fontFamily: 'var(--font-mono)' },
  { tag: t.quote, color: 'var(--cm-quote)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--cm-meta)' },
  { tag: t.list, color: 'var(--cm-list)' },
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: 'var(--hl-keyword)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--hl-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--hl-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--hl-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--hl-function)' },
  { tag: [t.typeName, t.className, t.tagName], color: 'var(--hl-type)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--hl-attr)' }
]);

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: 'var(--editor-font-size)', backgroundColor: 'var(--bg)', color: 'var(--text)' },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.6',
    overflow: 'auto',
    // Ligatures would render "|---|" and "-->" as glyphs, hiding the real source.
    fontVariantLigatures: 'none',
    fontFeatureSettings: '"calt" 0, "liga" 0'
  },
  '.cm-content': { padding: '16px 0 40vh', caretColor: 'var(--accent)', maxWidth: '980px' },
  '.cm-line': { padding: '0 20px 0 12px' },
  '.cm-gutters': { backgroundColor: 'var(--bg)', color: 'var(--text-faint)', border: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-muted)' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--selection) !important'
  },
  '.cm-selectionMatch': { backgroundColor: 'var(--selection-match)' },
  '.cm-searchMatch': { backgroundColor: 'var(--search-match)', outline: '1px solid var(--accent)' },
  '.cm-panels': { backgroundColor: 'var(--bg-elev)', color: 'var(--text)', borderColor: 'var(--border)' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': { fontSize: '12px' },
  '.cm-panel.cm-search input[type=checkbox]': { verticalAlign: 'middle' },
  '.cm-textfield': {
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: '4px'
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--bg-sidebar)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: '4px'
  },
  '&.cm-focused': { outline: 'none' }
});

export interface EditorCallbacks {
  onChange(text: string): void;
  onSave(): void;
  onImages(files: File[], pos: number | null, view: EditorView): void;
  onScroll(ratio: number): void;
}

function isImageFile(f: File): boolean {
  return f.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|avif|ico)$/i.test(f.name);
}

function extensions(cb: EditorCallbacks, markdownMode: boolean): Extension[] {
  return [
    lineNumbers(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    rectangularSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    keymap.of([
      { key: 'Mod-s', preventDefault: true, run: () => (cb.onSave(), true) },
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab
    ]),
    markdownMode ? markdown({ base: markdownLanguage, codeLanguages: languages }) : [],
    syntaxHighlighting(highlight),
    theme,
    EditorView.updateListener.of((u) => {
      if (u.docChanged) cb.onChange(u.state.doc.toString());
    }),
    EditorView.domEventHandlers({
      paste(event, view) {
        const files = [...(event.clipboardData?.files ?? [])].filter(isImageFile);
        if (!files.length) return false;
        event.preventDefault();
        cb.onImages(files, null, view);
        return true;
      },
      drop(event, view) {
        const files = [...(event.dataTransfer?.files ?? [])].filter(isImageFile);
        if (!files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        cb.onImages(files, pos, view);
        return true;
      },
      scroll(_event, view) {
        const s = view.scrollDOM;
        const max = s.scrollHeight - s.clientHeight;
        cb.onScroll(max > 0 ? s.scrollTop / max : 0);
        return false;
      }
    })
  ];
}

export function createState(text: string, cb: EditorCallbacks, markdownMode = true): EditorState {
  return EditorState.create({ doc: text, extensions: extensions(cb, markdownMode) });
}

export function createEditor(parent: HTMLElement, text: string, cb: EditorCallbacks): EditorView {
  return new EditorView({ state: createState(text, cb), parent });
}

/** Inserts text at `pos` (or replaces the selection) and moves the cursor after it. */
export function insertText(view: EditorView, text: string, pos: number | null): void {
  const sel = view.state.selection.main;
  const from = pos ?? sel.from;
  const to = pos ?? sel.to;
  view.dispatch({
    changes: { from, to, insert: text },
    selection: { anchor: from + text.length },
    scrollIntoView: true
  });
  view.focus();
}
