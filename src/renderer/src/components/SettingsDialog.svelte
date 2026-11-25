<script lang="ts">
  import type { ThemeSetting, ViewMode } from '../../../shared/types';
  import { settings, ui } from '../lib/state.svelte';
  import * as A from '../lib/actions';
  import Icon from './Icon.svelte';

  const delays = [500, 1000, 2000, 3000, 5000, 10000];
  const themes: { v: ThemeSetting; label: string }[] = [
    { v: 'system', label: 'System' },
    { v: 'light', label: 'Light' },
    { v: 'dark', label: 'Dark' }
  ];
  const modes: { v: ViewMode; label: string }[] = [
    { v: 'editor', label: 'Editor' },
    { v: 'split', label: 'Split' },
    { v: 'preview', label: 'Preview' }
  ];
  const shortcuts: [string, string][] = [
    ['Ctrl+S', 'Save'],
    ['Ctrl+N', 'New file'],
    ['Ctrl+P', 'Quick open file'],
    ['Ctrl+Shift+F', 'Search documents'],
    ['Ctrl+1 / 2 / 3', 'Editor / Split / Preview'],
    ['Ctrl+B', 'Toggle sidebar'],
    ['Ctrl+F', 'Find in editor'],
    ['Ctrl+V', 'Paste image into editor'],
    ['F2 / Del', 'Rename / delete selected item'],
    ['Ctrl+,', 'Settings']
  ];

  const cfg = $derived(settings.cfg);
  function close() {
    ui.settingsOpen = false;
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="overlay" role="presentation" onmousedown={(e) => e.target === e.currentTarget && close()}>
  <div class="panel" role="dialog" aria-modal="true" aria-label="Settings">
    <header>
      <h2>Settings</h2>
      <button class="icon-btn" aria-label="Close" onclick={close}><Icon name="x" /></button>
    </header>

    {#if cfg}
      <section>
        <div class="row">
          <div>
            <div class="label">Theme</div>
          </div>
          <div class="seg">
            {#each themes as t (t.v)}
              <button class:on={cfg.theme === t.v} onclick={() => A.updateSettings({ theme: t.v })}>{t.label}</button>
            {/each}
          </div>
        </div>

        <div class="row">
          <div>
            <div class="label">Autosave</div>
            <div class="hint">Save automatically after you stop typing. When off, use Ctrl+S.</div>
          </div>
          <label class="switch">
            <input
              type="checkbox"
              checked={cfg.autosave.enabled}
              onchange={(e) => A.updateSettings({ autosave: { enabled: (e.currentTarget as HTMLInputElement).checked } })}
            />
            <span></span>
          </label>
        </div>

        <div class="row" class:disabled={!cfg.autosave.enabled}>
          <div>
            <div class="label">Autosave delay</div>
          </div>
          <select
            value={cfg.autosave.delayMs}
            disabled={!cfg.autosave.enabled}
            onchange={(e) => A.updateSettings({ autosave: { delayMs: Number((e.currentTarget as HTMLSelectElement).value) } })}
          >
            {#each delays as d (d)}<option value={d}>{d / 1000} s</option>{/each}
          </select>
        </div>

        <div class="row">
          <div>
            <div class="label">Default view mode</div>
            <div class="hint">Used for projects that have no saved view mode.</div>
          </div>
          <div class="seg">
            {#each modes as m (m.v)}
              <button class:on={cfg.defaultViewMode === m.v} onclick={() => A.updateSettings({ defaultViewMode: m.v })}>
                {m.label}
              </button>
            {/each}
          </div>
        </div>
      </section>
    {/if}

    <h3>Keyboard shortcuts</h3>
    <div class="shortcuts">
      {#each shortcuts as [k, d] (k)}
        <span class="kbd">{k}</span><span>{d}</span>
      {/each}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 800;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 8vh;
    background: rgba(0, 0, 0, 0.32);
  }
  .panel {
    width: min(560px, calc(100vw - 32px));
    max-height: 84vh;
    overflow: auto;
    padding: 18px 22px 20px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--bg-elev);
    box-shadow: var(--shadow);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 16px;
  }
  section {
    margin-top: 10px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
  }
  .row.disabled {
    opacity: 0.55;
  }
  .label {
    font-weight: 600;
  }
  .hint {
    margin-top: 2px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .seg {
    display: flex;
    padding: 2px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg-sidebar);
    flex: none;
  }
  .seg button {
    height: 26px;
    padding: 0 12px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  .seg button.on {
    background: var(--bg-elev);
    color: var(--text);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  }
  .switch {
    position: relative;
    width: 40px;
    height: 22px;
    flex: none;
    cursor: pointer;
  }
  .switch input {
    opacity: 0;
    width: 0;
    height: 0;
    position: absolute;
  }
  .switch span {
    position: absolute;
    inset: 0;
    border-radius: 11px;
    background: var(--border-strong);
    transition: background 0.15s;
  }
  .switch span::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.15s;
  }
  .switch input:checked + span {
    background: var(--success);
  }
  .switch input:checked + span::after {
    transform: translateX(18px);
  }
  .switch input:focus-visible + span {
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  h3 {
    margin: 22px 0 10px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .shortcuts {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 8px 14px;
    align-items: center;
  }
  .shortcuts .kbd {
    justify-self: start;
  }
</style>
