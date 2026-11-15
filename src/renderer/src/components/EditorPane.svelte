<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { EditorView } from '@codemirror/view';
  import { doc, projects } from '../lib/state.svelte';
  import { createEditor, createState, insertText, type EditorCallbacks } from '../lib/editor/setup';
  import { editorRef } from '../lib/editor/ref';
  import { api } from '../lib/api';
  import { showError, toast } from '../lib/dialogs';
  import { editorScrolled, registerEditor } from '../lib/scrollSync';
  import * as A from '../lib/actions';

  let host: HTMLDivElement;
  let view: EditorView | null = null;

  function altFor(file: File): string {
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[[\]]/g, '');
    return !name || name === 'image' ? 'image' : name;
  }

  async function onImages(files: File[], pos: number | null, v: EditorView) {
    const id = projects.active?.id;
    const mdPath = doc.path;
    if (!id || !mdPath) return;
    if (doc.kind !== 'markdown') {
      toast('Images can only be inserted into Markdown files.', 'error');
      return;
    }
    const parts: string[] = [];
    for (const f of files) {
      try {
        const diskPath = window.api.getPathForFile(f);
        let link: string;
        if (diskPath) {
          [link] = await api.importDroppedImages(id, mdPath, [diskPath]);
        } else {
          const bytes = new Uint8Array(await f.arrayBuffer());
          link = await api.savePastedImage(id, mdPath, bytes, f.type.split('/')[1] ?? 'png');
        }
        parts.push(`![${diskPath ? altFor(f) : 'image'}](${link})`);
      } catch (e) {
        showError(e);
      }
    }
    if (!parts.length || doc.path !== mdPath) return;
    insertText(v, parts.join('\n'), pos);
    void A.refreshTree();
  }

  const callbacks: EditorCallbacks = {
    onChange: (text) => A.setContent(text),
    onSave: () => void A.saveNow(),
    onImages: (files, pos, v) => void onImages(files, pos, v),
    onScroll: (ratio) => editorScrolled(ratio)
  };

  onMount(() => {
    view = createEditor(host, doc.content, callbacks);
    editorRef.view = view;
    registerEditor((ratio) => {
      if (!view) return;
      const s = view.scrollDOM;
      s.scrollTop = ratio * (s.scrollHeight - s.clientHeight);
    });
    return () => {
      registerEditor(null);
      editorRef.view = null;
      view?.destroy();
      view = null;
    };
  });

  // Load a fresh editor state whenever a different document is opened.
  $effect(() => {
    void doc.loadToken;
    untrack(() => {
      if (!view) return;
      view.setState(createState(doc.content, callbacks, doc.kind === 'markdown'));
      view.scrollDOM.scrollTop = 0;
    });
  });
</script>

<div class="editor" bind:this={host}></div>

<style>
  .editor {
    height: 100%;
    overflow: hidden;
    user-select: text;
  }
</style>
