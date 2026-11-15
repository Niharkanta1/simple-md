<script lang="ts">
  import { ui } from '../lib/state.svelte';
  import { closeMenu } from '../lib/dialogs';

  let el: HTMLDivElement | undefined = $state();
  let pos = $state({ x: 0, y: 0 });

  $effect(() => {
    const m = ui.menu;
    if (!m || !el) return;
    // Keep the menu on screen.
    const r = el.getBoundingClientRect();
    pos = {
      x: Math.max(4, Math.min(m.x, window.innerWidth - r.width - 4)),
      y: Math.max(4, Math.min(m.y, window.innerHeight - r.height - 4))
    };
  });

  function onWindowDown(e: MouseEvent) {
    if (ui.menu && el && !el.contains(e.target as Node)) closeMenu();
  }
  function onKey(e: KeyboardEvent) {
    if (ui.menu && e.key === 'Escape') closeMenu();
  }
</script>

<svelte:window onmousedown={onWindowDown} onkeydown={onKey} onblur={closeMenu} onresize={closeMenu} />

{#if ui.menu}
  <div class="menu" bind:this={el} style="left:{pos.x || ui.menu.x}px; top:{pos.y || ui.menu.y}px" role="menu">
    {#each ui.menu.items as item, i (i)}
      {#if item.separator}
        <div class="sep"></div>
      {:else}
        <button
          class="item"
          class:danger={item.danger}
          disabled={item.disabled}
          role="menuitem"
          onclick={() => {
            closeMenu();
            item.run?.();
          }}
        >
          <span>{item.label}</span>
          {#if item.shortcut}<span class="shortcut">{item.shortcut}</span>{/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .menu {
    position: fixed;
    z-index: 1000;
    min-width: 210px;
    max-width: 360px;
    max-height: calc(100vh - 8px);
    overflow-y: auto;
    padding: 5px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg-elev);
    box-shadow: var(--shadow);
  }
  .item {
    display: flex;
    width: 100%;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 6px 10px;
    border: none;
    border-radius: 5px;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .item span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item:hover:not(:disabled) {
    background: var(--accent);
    color: var(--accent-text);
  }
  .item:disabled {
    opacity: 0.45;
    cursor: default;
  }
  .item.danger {
    color: var(--danger);
  }
  .item.danger:hover {
    background: var(--danger);
    color: #fff;
  }
  .shortcut {
    font-size: 11px;
    opacity: 0.65;
  }
  .sep {
    height: 1px;
    margin: 4px 6px;
    background: var(--border);
  }
</style>
