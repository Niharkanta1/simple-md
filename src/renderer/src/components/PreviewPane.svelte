<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { doc, projects, ui } from '../lib/state.svelte';
  import { createMarkdownRenderer } from '../lib/markdown/renderer';
  import { applyCachedDiagrams, renderDiagrams } from '../lib/markdown/mermaid';
  import { classifyLink, rewriteImages } from '../lib/markdown/links';
  import { api } from '../lib/api';
  import { showError, toast } from '../lib/dialogs';
  import { previewScrolled, registerPreview } from '../lib/scrollSync';
  import { fileKind } from '../lib/util/paths';
  import * as A from '../lib/actions';

  let scroller: HTMLDivElement;
  let body: HTMLDivElement;
  const render = createMarkdownRenderer();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastToken = -1;
  let lastTheme = '';

  function update() {
    if (!body) return;
    const path = doc.path;
    const pid = projects.active?.id;
    const theme = ui.resolvedTheme;
    if (doc.kind === 'markdown') {
      body.innerHTML = render(doc.content);
      if (pid && path) rewriteImages(body, pid, path);
      applyCachedDiagrams(body, theme);
      void renderDiagrams(body, theme).catch((e) => console.error(e));
    } else {
      body.innerHTML = '';
      const pre = document.createElement('pre');
      pre.className = 'plain-text';
      pre.textContent = doc.content;
      body.appendChild(pre);
    }
  }

  $effect(() => {
    // Dependencies
    void doc.content;
    const token = doc.loadToken;
    const theme = ui.resolvedTheme;
    untrack(() => {
      if (timer) clearTimeout(timer);
      if (token !== lastToken || theme !== lastTheme) {
        // New document or theme: render immediately.
        lastToken = token;
        lastTheme = theme;
        update();
        if (scroller) scroller.scrollTop = 0;
      } else {
        timer = setTimeout(update, 150);
      }
    });
  });

  onMount(() => {
    registerPreview((ratio) => {
      if (scroller) scroller.scrollTop = ratio * (scroller.scrollHeight - scroller.clientHeight);
    });
    return () => {
      registerPreview(null);
      if (timer) clearTimeout(timer);
    };
  });

  function scrollToAnchor(id: string) {
    const target = body?.querySelector(`[id="${CSS.escape(id)}"]`) ?? body?.querySelector(`[name="${CSS.escape(id)}"]`);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else toast(`Heading "#${id}" not found.`);
  }

  async function onClick(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest('a');
    if (!a || !body.contains(a)) return;
    e.preventDefault();
    const href = a.getAttribute('href') ?? '';
    const action = classifyLink(href, doc.path ?? '');
    switch (action.type) {
      case 'external':
        await api.openExternal(action.url).catch(showError);
        break;
      case 'anchor':
        scrollToAnchor(action.id);
        break;
      case 'file': {
        const node = A.findNode(action.path);
        if (!node) {
          toast(`File not found: ${action.path}`, 'error');
        } else if (node.type === 'dir') {
          A.toggleFolder(node.path, true);
          await A.revealInExplorer(node.path);
        } else if (fileKind(node.path) === 'other') {
          await A.revealInExplorer(node.path);
        } else {
          await A.openFile(node.path);
          if (action.anchor && doc.path === node.path) setTimeout(() => scrollToAnchor(action.anchor!), 60);
        }
        break;
      }
      case 'blocked':
        if (action.reason) toast(action.reason);
        break;
    }
  }

  function onScroll() {
    const max = scroller.scrollHeight - scroller.clientHeight;
    previewScrolled(max > 0 ? scroller.scrollTop / max : 0);
  }
</script>

<div class="preview" bind:this={scroller} onscroll={onScroll}>
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="markdown-body" bind:this={body} onclick={onClick}></div>
</div>

<style>
  .preview {
    height: 100%;
    overflow: auto;
    background: var(--bg);
  }
</style>
