<script lang="ts">
  import { onMount } from 'svelte';
  import type { GitignoreData, GitignorePreset } from '../../../shared/types';
  import { projects, ui } from '../lib/state.svelte';
  import { api } from '../lib/api';
  import { showError, toast } from '../lib/dialogs';
  import * as A from '../lib/actions';
  import Icon from './Icon.svelte';

  let data = $state<GitignoreData | null>(null);
  let presets = $state<GitignorePreset[]>([]);
  let tab = $state<'rules' | 'raw'>('rules');
  let pattern = $state('');
  let raw = $state('');
  let busy = $state(false);

  const id = $derived(projects.active?.id ?? '');

  async function load() {
    try {
      [data, presets] = await Promise.all([api.getGitignore(id), api.gitignorePresets()]);
      raw = data.content;
    } catch (e) {
      showError(e);
    }
  }

  onMount(load);

  async function run(fn: () => Promise<GitignoreData>) {
    busy = true;
    try {
      data = await fn();
      raw = data.content;
      await A.refreshTree();
    } catch (e) {
      showError(e);
    } finally {
      busy = false;
    }
  }

  async function addPattern() {
    const p = pattern.trim();
    if (!p) return;
    await run(() => api.addIgnoreRule(id, p));
    pattern = '';
  }

  function presetState(p: GitignorePreset): 'all' | 'some' | 'none' {
    const rules = data?.rules ?? [];
    const n = p.patterns.filter((x) => rules.includes(x)).length;
    return n === 0 ? 'none' : n === p.patterns.length ? 'all' : 'some';
  }

  async function togglePreset(p: GitignorePreset) {
    const st = presetState(p);
    await run(async () => {
      let res = data!;
      for (const pat of p.patterns) {
        if (st === 'all') res = await api.removeIgnoreRule(id, pat);
        else if (!res.rules.includes(pat)) res = await api.addIgnoreRule(id, pat);
      }
      return res;
    });
  }

  async function saveRaw() {
    await run(() => api.setGitignore(id, raw));
    toast('.gitignore saved', 'success');
  }

  function close() {
    ui.gitignoreOpen = false;
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && !ui.dialog && close()} />

<div class="overlay" role="presentation" onmousedown={(e) => e.target === e.currentTarget && close()}>
  <div class="panel" role="dialog" aria-modal="true" aria-label="Manage .gitignore">
    <header>
      <div>
        <h2>.gitignore</h2>
        <p class="sub">
          {data?.exists ? 'Rules from the project root .gitignore.' : 'No .gitignore yet — adding a rule creates it.'}
          Ignored items appear dimmed in the sidebar.
        </p>
      </div>
      <button class="icon-btn" aria-label="Close" onclick={close}><Icon name="x" /></button>
    </header>

    <div class="tabs">
      <button class:on={tab === 'rules'} onclick={() => (tab = 'rules')}>Rules</button>
      <button class:on={tab === 'raw'} onclick={() => (tab = 'raw')}>Edit File</button>
    </div>

    {#if tab === 'rules'}
      <form
        class="add"
        onsubmit={(e) => {
          e.preventDefault();
          void addPattern();
        }}
      >
        <input bind:value={pattern} placeholder="Pattern, e.g. *.log, drafts/, /secret.md" spellcheck="false" />
        <button class="btn primary" type="submit" disabled={busy || !pattern.trim()}>Add Rule</button>
      </form>

      <h3>Common patterns</h3>
      <div class="presets">
        {#each presets as p (p.id)}
          {@const st = presetState(p)}
          <button
            class="chip {st}"
            disabled={busy}
            title={p.patterns.join('\n')}
            onclick={() => togglePreset(p)}
          >
            {#if st === 'all'}<Icon name="check" size={12} stroke={2.4} />{/if}
            {p.label}
          </button>
        {/each}
      </div>

      <h3>Active rules ({data?.rules.length ?? 0})</h3>
      <ul class="rules">
        {#each data?.rules ?? [] as r (r)}
          <li>
            <code class:negate={r.startsWith('!')}>{r}</code>
            <button class="icon-btn" title="Remove rule" disabled={busy} onclick={() => run(() => api.removeIgnoreRule(id, r))}>
              <Icon name="x" size={14} />
            </button>
          </li>
        {:else}
          <li class="none">No rules yet.</li>
        {/each}
      </ul>
    {:else}
      <textarea bind:value={raw} spellcheck="false" placeholder="# One pattern per line"></textarea>
      <div class="raw-actions">
        <button class="btn" onclick={() => (raw = data?.content ?? '')} disabled={busy}>Revert</button>
        <button class="btn primary" onclick={saveRaw} disabled={busy || raw === data?.content}>Save .gitignore</button>
      </div>
    {/if}
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
    width: min(620px, calc(100vw - 32px));
    max-height: 82vh;
    display: flex;
    flex-direction: column;
    padding: 18px 20px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--bg-elev);
    box-shadow: var(--shadow);
  }
  header {
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  h2 {
    margin: 0;
    font-size: 16px;
    font-family: var(--font-mono);
  }
  .sub {
    margin: 4px 0 0;
    color: var(--text-muted);
  }
  .tabs {
    display: flex;
    gap: 4px;
    margin: 14px 0 12px;
    border-bottom: 1px solid var(--border);
  }
  .tabs button {
    padding: 6px 12px;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
  }
  .tabs button.on {
    color: var(--text);
    border-bottom-color: var(--accent);
    font-weight: 600;
  }
  .add {
    display: flex;
    gap: 8px;
  }
  .add input {
    flex: 1;
    font-family: var(--font-mono);
  }
  h3 {
    margin: 16px 0 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 10px;
    border-radius: 13px;
    border: 1px solid var(--border-strong);
    background: transparent;
    cursor: pointer;
    font-size: 12px;
  }
  .chip:hover {
    background: var(--hover);
  }
  .chip.all {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }
  .chip.some {
    border-style: dashed;
    border-color: var(--accent);
  }
  .rules {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
    min-height: 60px;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  .rules li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px 4px 12px;
  }
  .rules li + li {
    border-top: 1px solid var(--border);
  }
  .rules code {
    font-family: var(--font-mono);
    user-select: text;
  }
  .rules code.negate {
    color: var(--success);
  }
  .none {
    color: var(--text-faint);
    padding: 10px 12px !important;
  }
  textarea {
    width: 100%;
    min-height: 320px;
    resize: vertical;
    font-family: var(--font-mono);
    font-size: 13px;
    line-height: 1.5;
  }
  .raw-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 10px;
  }
</style>
