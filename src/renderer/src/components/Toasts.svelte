<script lang="ts">
  import { ui } from '../lib/state.svelte';
  import { dismissToast } from '../lib/dialogs';
  import Icon from './Icon.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each ui.toasts as t (t.id)}
    <div class="toast {t.kind}">
      <span class="msg">{t.message}</span>
      {#if t.action}
        <button
          class="action"
          onclick={() => {
            t.action?.run();
            dismissToast(t.id);
          }}>{t.action.label}</button
        >
      {/if}
      <button class="icon-btn close" aria-label="Dismiss" onclick={() => dismissToast(t.id)}><Icon name="x" size={14} /></button>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    right: 16px;
    bottom: 36px;
    z-index: 950;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: min(420px, calc(100vw - 32px));
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 8px 9px 14px;
    border-radius: 8px;
    border: 1px solid var(--border);
    border-left: 4px solid var(--accent);
    background: var(--bg-elev);
    box-shadow: var(--shadow);
    animation: in 0.16s ease-out;
  }
  .toast.success {
    border-left-color: var(--success);
  }
  .toast.error {
    border-left-color: var(--danger);
  }
  .msg {
    flex: 1;
    line-height: 1.4;
    white-space: pre-line;
    user-select: text;
  }
  .action {
    border: none;
    background: transparent;
    color: var(--accent);
    font-weight: 600;
    cursor: pointer;
  }
  .close {
    width: 22px;
    height: 22px;
  }
  @keyframes in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
</style>
