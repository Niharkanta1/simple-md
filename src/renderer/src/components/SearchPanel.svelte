<script lang="ts">
  import { tick } from 'svelte';
  import { doc, search, ui } from '../lib/state.svelte';
  import { basename, dirname } from '../lib/util/paths';
  import * as A from '../lib/actions';
  import Icon from './Icon.svelte';

  let input: HTMLInputElement | undefined = $state();

  /** Tokens used for highlighting: committed chips plus what the server parsed. */
  const activeTokens = $derived(search.response?.tokens ?? search.tokens);
  const results = $derived(search.response?.results ?? []);
  const hasQuery = $derived(search.tokens.length > 0 || search.draft.trim() !== '');

  $effect(() => {
    void search.focusToken;
    void tick().then(() => input?.focus());
  });

  function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Splits text into plain / highlighted parts for the active tokens. */
  function highlight(text: string, tokens: string[]): { t: string; hit: boolean }[] {
    if (!tokens.length) return [{ t: text, hit: false }];
    const re = new RegExp(`(${[...tokens].sort((a, b) => b.length - a.length).map(escapeRe).join('|')})`, 'gi');
    return text
      .split(re)
      .filter((p) => p !== '')
      .map((p) => ({ t: p, hit: tokens.includes(p.toLowerCase()) }));
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (search.draft.trim()) A.commitSearchDraft();
      else if (results[0]) void A.openFileAt(results[0].path, results[0].snippets[0]?.line ?? 1, activeTokens);
    } else if (e.key === 'Backspace' && search.draft === '' && search.tokens.length) {
      e.preventDefault();
      A.removeSearchToken(search.tokens[search.tokens.length - 1]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (hasQuery) A.clearSearch();
      else ui.searchOpen = false;
    }
  }

  function close() {
    ui.searchOpen = false;
  }
</script>

<div class="search">
  <div class="head">
    <span class="title">Search</span>
    <button class="icon-btn" title="Back to Files" aria-label="Close search" onclick={close}><Icon name="x" size={15} /></button>
  </div>

  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="box" onclick={() => input?.focus()}>
    <Icon name="search" size={14} />
    {#each search.tokens as t (t)}
      <span class="chip" title={t}>
        <span class="chip-text">{t}</span>
        <button class="chip-x" aria-label="Remove {t}" onclick={(e) => (e.stopPropagation(), A.removeSearchToken(t))}>
          <Icon name="x" size={11} stroke={2.4} />
        </button>
      </span>
    {/each}
    <input
      bind:this={input}
      bind:value={search.draft}
      placeholder={search.tokens.length ? 'Add term…' : 'Search documents…'}
      spellcheck="false"
      oninput={() => A.runSearchSoon()}
      onkeydown={onKey}
    />
  </div>
  <div class="hint">Enter adds a search token · "quotes" for phrases · Backspace removes</div>

  <div class="results">
    {#if search.error}
      <div class="status error">{search.error}</div>
    {:else if !hasQuery}
      <div class="status">Type words to find documents that contain all of them.</div>
    {:else if search.response}
      <div class="status">
        {#if search.busy}<span class="busy">Searching…</span>{/if}
        {results.length}{search.response.truncated ? '+' : ''}
        {results.length === 1 ? 'document' : 'documents'} of {search.response.searched}
      </div>
      {#each results as r (r.path)}
        <div class="result" class:active={doc.path === r.path}>
          <button class="file" title={r.path} onclick={() => A.openFileAt(r.path, r.snippets[0]?.line ?? 1, activeTokens)}>
            <Icon name="fileMd" size={14} />
            <span class="name">
              {#each highlight(basename(r.path), activeTokens) as p, i (i)}{#if p.hit}<mark>{p.t}</mark>{:else}{p.t}{/if}{/each}
            </span>
            {#if dirname(r.path)}<span class="dir">{dirname(r.path)}</span>{/if}
            <span class="count" title="Matches in the document">{r.matches}</span>
          </button>
          {#each r.snippets as s (s.line)}
            <button class="snippet" onclick={() => A.openFileAt(r.path, s.line, activeTokens)}>
              <span class="ln">{s.line}</span>
              <span class="text">
                {#each highlight(s.text, activeTokens) as p, i (i)}{#if p.hit}<mark>{p.t}</mark>{:else}{p.t}{/if}{/each}
              </span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="status">No documents match all search tokens.</div>
      {/each}
    {:else if search.busy}
      <div class="status">Searching…</div>
    {/if}
  </div>
</div>

<style>
  .search {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 8px 4px 14px;
  }
  .title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
  }
  .box {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    margin: 4px 10px 0;
    padding: 4px 6px;
    min-height: 30px;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--bg-input);
    color: var(--text-faint);
    cursor: text;
  }
  .box:focus-within {
    border-color: var(--accent);
  }
  .box input {
    flex: 1;
    min-width: 70px;
    height: 22px;
    padding: 0 2px;
    border: none;
    outline: none;
    background: transparent;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    max-width: 100%;
    height: 22px;
    padding: 0 2px 0 8px;
    border-radius: 11px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 12px;
    font-weight: 600;
  }
  .chip-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip-x {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .chip-x:hover {
    background: var(--active);
  }
  .hint {
    padding: 4px 14px 6px;
    font-size: 11px;
    color: var(--text-faint);
  }
  .results {
    flex: 1;
    overflow: auto;
    padding: 0 6px 24px;
    border-top: 1px solid var(--border);
  }
  .status {
    padding: 8px 8px 4px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .status.error {
    color: var(--danger);
  }
  .busy {
    margin-right: 6px;
    color: var(--text-faint);
  }
  .result {
    padding: 2px 0 4px;
  }
  .file,
  .snippet {
    display: flex;
    align-items: center;
    gap: 7px;
    width: 100%;
    min-width: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  .file {
    height: 26px;
    padding: 0 8px;
    color: var(--text);
  }
  .result.active .file {
    color: var(--accent);
  }
  .file:hover,
  .snippet:hover {
    background: var(--hover);
  }
  .name {
    flex: none;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }
  .dir {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: var(--text-faint);
  }
  .count {
    margin-left: auto;
    flex: none;
    padding: 0 6px;
    border-radius: 9px;
    background: var(--hover);
    font-size: 11px;
    color: var(--text-muted);
  }
  .snippet {
    align-items: baseline;
    padding: 3px 8px 3px 29px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .ln {
    flex: none;
    min-width: 22px;
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--text-faint);
    text-align: right;
  }
  .text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    word-break: break-word;
  }
  mark {
    padding: 0 1px;
    border-radius: 2px;
    background: var(--search-match);
    color: var(--text);
  }
</style>
