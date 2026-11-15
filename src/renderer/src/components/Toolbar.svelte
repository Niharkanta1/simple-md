<script lang="ts">
  import type { ViewMode } from '../../../shared/types';
  import { doc, ui } from '../lib/state.svelte';
  import { basename, dirname } from '../lib/util/paths';
  import { editorRef } from '../lib/editor/ref';
  import { insertText } from '../lib/editor/setup';
  import * as A from '../lib/actions';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';

  const modes: { mode: ViewMode; label: string; icon: IconName; key: string }[] = [
    { mode: 'editor', label: 'Editor', icon: 'edit', key: 'Ctrl+1' },
    { mode: 'split', label: 'Split', icon: 'columns', key: 'Ctrl+2' },
    { mode: 'preview', label: 'Preview', icon: 'eye', key: 'Ctrl+3' }
  ];

  async function insertImage() {
    const links = await A.insertImagesFromDialog();
    const v = editorRef.view;
    if (links.length && v) insertText(v, links.map((l) => `![image](${l})`).join('\n'), null);
  }
</script>

<header class="toolbar">
  <button
    class="icon-btn"
    title="Toggle Sidebar (Ctrl+B)"
    onclick={() => {
      ui.sidebarCollapsed = !ui.sidebarCollapsed;
      A.persistSidebar();
    }}><Icon name="sidebar" /></button
  >

  <div class="crumbs" title={doc.path ?? ''}>
    {#if doc.path}
      {#if dirname(doc.path)}<span class="dir">{dirname(doc.path)}/</span>{/if}
      <span class="file">{basename(doc.path)}</span>
      {#if doc.dirty}<span class="dirty" title="Unsaved changes">●</span>{/if}
    {/if}
  </div>

  <div class="actions">
    {#if doc.kind === 'markdown'}
      <button class="icon-btn" title="Insert Image… (or paste / drop an image into the editor)" onclick={insertImage}>
        <Icon name="image" />
      </button>
      <button class="icon-btn" title="Export this file as ZIP" onclick={() => doc.path && A.exportFile(doc.path)}>
        <Icon name="download" />
      </button>
    {/if}
    {#if doc.kind === 'markdown' || doc.kind === 'text'}
      <div class="segmented" role="tablist" aria-label="View mode">
        {#each modes as m (m.mode)}
          <button
            role="tab"
            aria-selected={ui.viewMode === m.mode}
            class:on={ui.viewMode === m.mode}
            title="{m.label} ({m.key})"
            onclick={() => A.setViewMode(m.mode)}
          >
            <Icon name={m.icon} size={14} />
            <span>{m.label}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>
</header>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 42px;
    padding: 0 10px;
    border-bottom: 1px solid var(--border);
    background: var(--bg);
    flex: none;
  }
  .crumbs {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 1px;
    overflow: hidden;
    white-space: nowrap;
  }
  .dir {
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
  }
  .file {
    font-weight: 600;
    flex: none;
  }
  .dirty {
    margin-left: 6px;
    color: var(--warning);
    font-size: 11px;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .segmented {
    display: flex;
    margin-left: 6px;
    padding: 2px;
    border-radius: 8px;
    background: var(--bg-sidebar);
    border: 1px solid var(--border);
  }
  .segmented button {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 26px;
    padding: 0 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
  }
  .segmented button:hover {
    color: var(--text);
  }
  .segmented button.on {
    background: var(--bg-elev);
    color: var(--text);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }
  @media (max-width: 860px) {
    .segmented span {
      display: none;
    }
  }
</style>
