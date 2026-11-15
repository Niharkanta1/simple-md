<script lang="ts">
  import { doc, settings } from '../lib/state.svelte';
  import * as A from '../lib/actions';
  import Icon from './Icon.svelte';

  const words = $derived.by(() => {
    if (!doc.path || doc.kind === 'image') return 0;
    const m = doc.content.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
    return m ? m.length : 0;
  });
  const lines = $derived(doc.path && doc.kind !== 'image' ? doc.content.split('\n').length : 0);

  const label = $derived.by(() => {
    switch (doc.saveState) {
      case 'saving':
        return 'Saving…';
      case 'dirty':
        return settings.autosave ? 'Unsaved — autosaving…' : 'Unsaved changes (Ctrl+S to save)';
      case 'error':
        return 'Save failed';
      default:
        return 'Saved';
    }
  });
</script>

<footer class="status">
  <div class="left">
    {#if doc.path && doc.kind !== 'image'}
      <span class="state {doc.saveState}" title={doc.saveError ?? ''}>
        <span class="dot"></span>{label}
      </span>
    {/if}
    <button
      class="toggle"
      class:on={settings.autosave}
      title="Toggle autosave (saves {(settings.autosaveDelay / 1000).toFixed(1)} s after you stop typing)"
      onclick={A.toggleAutosave}
    >
      <Icon name="power" size={12} stroke={2.2} />
      Autosave: {settings.autosave ? 'On' : 'Off'}
    </button>
  </div>
  <div class="right">
    {#if doc.path && doc.kind !== 'image'}
      <span>{words.toLocaleString()} words</span>
      <span>{lines.toLocaleString()} lines</span>
    {/if}
    <span>UTF-8</span>
  </div>
</footer>

<style>
  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 26px;
    padding: 0 10px;
    border-top: 1px solid var(--border);
    background: var(--bg-sidebar);
    color: var(--text-muted);
    font-size: 12px;
    flex: none;
  }
  .left,
  .right {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .state {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success);
  }
  .state.dirty .dot {
    background: var(--warning);
  }
  .state.saving .dot {
    background: var(--accent);
  }
  .state.error {
    color: var(--danger);
  }
  .state.error .dot {
    background: var(--danger);
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 20px;
    padding: 0 8px;
    border: 1px solid var(--border-strong);
    border-radius: 10px;
    background: transparent;
    color: var(--text-muted);
    font-size: 11px;
    cursor: pointer;
  }
  .toggle.on {
    border-color: var(--success);
    color: var(--success);
  }
  .toggle:hover {
    background: var(--hover);
  }
</style>
