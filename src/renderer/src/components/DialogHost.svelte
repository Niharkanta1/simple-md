<script lang="ts">
  import { tick } from 'svelte';
  import { ui } from '../lib/state.svelte';

  let value = $state('');
  let touched = $state(false);
  let input: HTMLInputElement | undefined = $state();
  let primaryBtn: HTMLButtonElement | undefined = $state();

  const d = $derived(ui.dialog);
  const error = $derived(d?.kind === 'prompt' && d.validate ? d.validate(value) : null);

  $effect(() => {
    const cur = ui.dialog;
    if (!cur) return;
    touched = false;
    if (cur.kind === 'prompt') {
      value = cur.value;
      void tick().then(() => {
        if (!input) return;
        input.focus();
        const dot = cur.selectStem ? value.lastIndexOf('.') : -1;
        input.setSelectionRange(0, dot > 0 ? dot : value.length);
      });
    } else {
      void tick().then(() => primaryBtn?.focus());
    }
  });

  function finish(result: string | null) {
    const cur = ui.dialog;
    ui.dialog = null;
    cur?.resolve(result);
  }

  function submit() {
    if (d?.kind !== 'prompt') return;
    touched = true;
    if (error) return;
    finish(value);
  }

  function onKey(e: KeyboardEvent) {
    if (!ui.dialog) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      finish(null);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if d}
  <div class="overlay" role="presentation" onmousedown={(e) => e.target === e.currentTarget && finish(null)}>
    <div class="dialog" role="dialog" aria-modal="true" aria-label={d.title}>
      <h2>{d.title}</h2>
      {#if d.message}<p class="message">{d.message}</p>{/if}

      {#if d.kind === 'prompt'}
        <form
          onsubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            bind:this={input}
            bind:value
            placeholder={d.placeholder}
            spellcheck="false"
            class:invalid={touched && error}
            oninput={() => (touched = true)}
          />
          <div class="error">{touched && error ? error : ''}</div>
          <div class="buttons">
            <button type="button" class="btn" onclick={() => finish(null)}>Cancel</button>
            <button type="submit" class="btn" class:primary={!d.danger} class:danger={d.danger} disabled={!!error}>
              {d.okLabel}
            </button>
          </div>
        </form>
      {:else}
        <div class="buttons">
          {#each d.buttons as b, i (b.value)}
            {#if i === d.buttons.length - 1}
              <button
                bind:this={primaryBtn}
                class="btn"
                class:primary={b.variant === 'primary'}
                class:danger={b.variant === 'danger'}
                onclick={() => finish(b.value)}>{b.label}</button
              >
            {:else}
              <button
                class="btn"
                class:primary={b.variant === 'primary'}
                class:danger={b.variant === 'danger'}
                onclick={() => finish(b.value)}>{b.label}</button
              >
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 900;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 14vh;
    background: rgba(0, 0, 0, 0.32);
  }
  .dialog {
    width: min(460px, calc(100vw - 32px));
    padding: 20px 22px 18px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--bg-elev);
    box-shadow: var(--shadow);
  }
  h2 {
    margin: 0 0 8px;
    font-size: 15px;
    font-weight: 650;
  }
  .message {
    margin: 0 0 14px;
    color: var(--text-muted);
    line-height: 1.5;
    white-space: pre-line;
    word-break: break-word;
    user-select: text;
  }
  input {
    width: 100%;
  }
  input.invalid {
    border-color: var(--danger);
  }
  .error {
    min-height: 18px;
    margin-top: 4px;
    font-size: 12px;
    color: var(--danger);
  }
  .buttons {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
</style>
