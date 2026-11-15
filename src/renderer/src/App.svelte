<script lang="ts">
  import { onMount } from 'svelte';
  import { doc, projects, tree, ui } from './lib/state.svelte';
  import { dirname, encodePath } from './lib/util/paths';
  import * as A from './lib/actions';
  import Sidebar from './components/Sidebar.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import EditorPane from './components/EditorPane.svelte';
  import PreviewPane from './components/PreviewPane.svelte';
  import Welcome from './components/Welcome.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import DialogHost from './components/DialogHost.svelte';
  import Toasts from './components/Toasts.svelte';
  import GitignorePanel from './components/GitignorePanel.svelte';
  import SettingsDialog from './components/SettingsDialog.svelte';
  import QuickOpen from './components/QuickOpen.svelte';
  import Icon from './components/Icon.svelte';

  onMount(() => {
    void A.init();
  });

  const textDoc = $derived(doc.path !== null && (doc.kind === 'markdown' || doc.kind === 'text'));
  const showEditor = $derived(textDoc && ui.viewMode !== 'preview');
  const showPreview = $derived(textDoc && ui.viewMode !== 'editor');

  $effect(() => {
    const name = doc.path ? doc.path.split('/').pop() : null;
    const project = projects.active?.name;
    document.title = [name ? `${doc.dirty ? '● ' : ''}${name}` : null, project, 'Simple Markdown'].filter(Boolean).join(' — ');
  });

  function currentDir(): string {
    const sel = tree.selected;
    if (!sel) return '';
    const node = A.findNode(sel);
    return node?.type === 'dir' ? node.path : dirname(sel);
  }

  function inTextInput(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function onKeydown(e: KeyboardEvent) {
    if (ui.dialog) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && !e.altKey) {
      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          void A.saveNow();
          return;
        case '1':
        case '2':
        case '3':
          if (textDoc) {
            e.preventDefault();
            A.setViewMode((['editor', 'split', 'preview'] as const)[Number(e.key) - 1]);
          }
          return;
        case 'b':
          e.preventDefault();
          ui.sidebarCollapsed = !ui.sidebarCollapsed;
          A.persistSidebar();
          return;
        case 'n':
          if (projects.active) {
            e.preventDefault();
            void A.newFile(currentDir());
          }
          return;
        case 'p':
          if (projects.active) {
            e.preventDefault();
            ui.quickOpen = true;
          }
          return;
        case ',':
          e.preventDefault();
          ui.settingsOpen = true;
          return;
      }
    }
    // Tree shortcuts: only when focus is in the sidebar (or nowhere in particular).
    const target = e.target as HTMLElement | null;
    const inSidebar = !!target?.closest?.('.sidebar') || target === document.body;
    if (inSidebar && !inTextInput(e) && tree.selected && projects.active) {
      if (e.key === 'F2') {
        e.preventDefault();
        tree.renaming = tree.selected;
      } else if (e.key === 'Delete') {
        e.preventDefault();
        void A.deleteEntry(tree.selected);
      }
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  <div class="body">
    {#if !ui.sidebarCollapsed}
      <Sidebar />
    {/if}

    <main class="main">
      {#if !ui.ready}
        <div class="loading"></div>
      {:else if !projects.active}
        <Welcome />
      {:else}
        <Toolbar />
        <div class="content">
          {#if doc.path && doc.kind === 'image'}
            <div class="image-view">
              <img src="mdimg://{projects.active.id}/{encodePath(doc.path)}" alt={doc.path} />
            </div>
          {:else if !doc.path}
            <div class="empty">
              <Icon name="fileMd" size={42} stroke={1.3} />
              <p>Select a file in the sidebar, or create a new one.</p>
              <div class="empty-actions">
                <button class="btn primary" onclick={() => A.newFile(currentDir())}><Icon name="filePlus" /> New File</button>
                <button class="btn" onclick={() => (ui.quickOpen = true)}><Icon name="search" /> Find File</button>
              </div>
              <p class="hint"><span class="kbd">Ctrl+N</span> new file · <span class="kbd">Ctrl+P</span> quick open · <span class="kbd">Ctrl+B</span> sidebar</p>
            </div>
          {/if}

          {#if textDoc}
            <div class="panes" class:split={showEditor && showPreview}>
              <div class="pane editor-pane" class:hidden={!showEditor}>
                <EditorPane />
              </div>
              {#if showPreview}
                <div class="pane preview-pane">
                  <PreviewPane />
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
      <StatusBar />
    </main>
  </div>

  {#if ui.gitignoreOpen && projects.active}<GitignorePanel />{/if}
  {#if ui.settingsOpen}<SettingsDialog />{/if}
  {#if ui.quickOpen && projects.active}<QuickOpen />{/if}
  <ContextMenu />
  <DialogHost />
  <Toasts />
</div>

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .body {
    flex: 1;
    min-height: 0;
    display: flex;
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  .content {
    flex: 1;
    min-height: 0;
    position: relative;
  }
  .panes {
    height: 100%;
    display: flex;
  }
  .pane {
    flex: 1;
    min-width: 0;
    height: 100%;
  }
  .pane.hidden {
    display: none;
  }
  .panes.split .editor-pane {
    border-right: 1px solid var(--border);
  }
  .image-view {
    height: 100%;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background:
      repeating-conic-gradient(var(--hover) 0% 25%, transparent 0% 50%) 50% / 20px 20px;
  }
  .image-view img {
    max-width: 100%;
    max-height: 100%;
    box-shadow: var(--shadow);
  }
  .empty {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--text-muted);
  }
  .empty p {
    margin: 0;
  }
  .empty-actions {
    display: flex;
    gap: 8px;
    margin-top: 6px;
  }
  .hint {
    margin-top: 14px !important;
    font-size: 12px;
    color: var(--text-faint);
  }
  .loading {
    flex: 1;
  }
</style>
