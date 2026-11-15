<script lang="ts">
  import { projects } from '../lib/state.svelte';
  import * as A from '../lib/actions';
  import Icon from './Icon.svelte';

  const recent = $derived([...projects.list].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt)).slice(0, 8));
</script>

<div class="welcome">
  <div class="card">
    <div class="logo"><Icon name="fileMd" size={34} stroke={1.6} /></div>
    <h1>Simple Markdown</h1>
    <p class="sub">A lightweight Markdown editor and project manager.</p>

    <div class="actions">
      <button class="btn primary large" onclick={A.createProject}><Icon name="folderPlus" /> New Project</button>
      <button class="btn large" onclick={A.openFolderAsProject}><Icon name="folderOpen" /> Open Folder</button>
      <button class="btn large" onclick={A.importZipAsProject}><Icon name="upload" /> Import ZIP</button>
    </div>

    {#if recent.length}
      <h2>Projects</h2>
      <ul class="list">
        {#each recent as p (p.id)}
          <li>
            <button class="proj" class:missing={!p.available} onclick={() => A.switchProject(p.id)} title={p.path}>
              <Icon name="project" />
              <span class="pname">{p.name}</span>
              <span class="ppath">{p.available ? p.path : 'Folder not found'}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .welcome {
    height: 100%;
    overflow: auto;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding: 9vh 24px 24px;
  }
  .card {
    width: min(620px, 100%);
    text-align: center;
  }
  .logo {
    display: inline-grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: var(--accent);
    color: var(--accent-text);
    margin-bottom: 14px;
  }
  h1 {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
  }
  .sub {
    margin: 6px 0 26px;
    color: var(--text-muted);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
  }
  h2 {
    margin: 36px 0 10px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    text-align: left;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow: hidden;
  }
  .list li + li {
    border-top: 1px solid var(--border);
  }
  .proj {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 14px;
    border: none;
    background: var(--bg);
    text-align: left;
    cursor: pointer;
  }
  .proj:hover {
    background: var(--hover);
  }
  .pname {
    font-weight: 600;
    flex: none;
  }
  .ppath {
    flex: 1;
    min-width: 0;
    color: var(--text-faint);
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: right;
  }
  .proj.missing .pname,
  .proj.missing .ppath {
    color: var(--danger);
  }
</style>
