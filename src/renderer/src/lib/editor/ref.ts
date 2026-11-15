import type { EditorView } from '@codemirror/view';

/** The single live editor instance (used by toolbar actions). */
export const editorRef: { view: EditorView | null } = { view: null };
