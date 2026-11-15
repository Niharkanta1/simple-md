<script lang="ts">
  import { onMount } from 'svelte';
  import { ui } from '../lib/state.svelte';
  import { basename, dirname } from '../lib/util/paths';
  import * as A from '../lib/actions';

  let query = $state('');
  let index = $state(0);
  let input: HTMLInputElement | undefined = $state();

  const files = A.allFiles();

  function score(path: string, q: string): number {
    const p = path.toLowerCase();
    const name = basename(p);
    if (!q) return 1;
    if (name.startsWith(q)) return 100 - name.length / 100;
    if (name.includes(q)) return 50 - name.length / 100;
    if (p.includes(q)) return 20 - p.length / 1000;
    // subsequence match
    let i = 0;
    for (const ch of p) if (ch === q[i]) i++;
    return i === q.length ? 5 - p.length / 1000 : -1;
  }

  const results = $derived.by(() => {
    const q = query.trim().toLowerCase();
    return files
      .map((f) => ({ f, s: score(f, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.f.localeCompare(b.f))
      .slice(0, 50)
      .map((x) => x.f);
  });

  $effect(() => {
    void query;
    index = 0;
  });

  onMount(() => input?.focus());

  function close() {
    ui.quickOpen = false;
  }

  function pick(path: string | undefined) {
    if (!path) return;
    close();
    void A.openFile(path);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      index = Math.min(index + 1, results.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      index = Math.max(index - 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(results[index]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }
</script>

<div class="overlay" role="presentation" onmousedown={(e) => e.target === e.currentTarget && close()}>
  <div class="box" role="dialog" aria-label="Quick open">
    <input bind:this={input} bind:value={query} placeholder="Type a file name…" spellcheck="false" onkeydown={onKey} />
    <ul>
      {#each results as f, i (f)}
        <li>
          <button class:on={i === index} onmouseenter={() => (index = i)} onclick={() => pick(f)}>
            <span class="n">{basename(f)}</span>
            <span class="d">{dirname(f)}</span>
          </button>
        </li>
      {:else}
        <li class="none">No matching files</li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 850;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 10vh;
    background: rgba(0, 0, 0, 0.2);
  }
  .box {
    width: min(560px, calc(100vw - 32px));
    padding: 8px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: var(--bg-elev);
    box-shadow: var(--shadow);
  }
  input {
    width: 100%;
    height: 36px;
    font-size: 14px;
  }
  ul {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    max-height: 50vh;
    overflow: auto;
  }
  li button {
    display: flex;
    align-items: baseline;
    gap: 10px;
    width: 100%;
    padding: 7px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  li button.on {
    background: var(--active);
  }
  .n {
    font-weight: 600;
  }
  .d {
    color: var(--text-faint);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .none {
    padding: 10px;
    color: var(--text-faint);
  }
</style>
