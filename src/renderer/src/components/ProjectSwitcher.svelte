<script lang="ts">
  import { projects, ui } from '../lib/state.svelte';
  import { openMenuAt } from '../lib/dialogs';
  import type { MenuItem } from '../lib/state.svelte';
  import * as A from '../lib/actions';
  import Icon from './Icon.svelte';

  let btn: HTMLButtonElement | undefined = $state();

  function openProjectMenu() {
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const active = projects.active;
    const items: MenuItem[] = [];
    const sorted = [...projects.list].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    for (const p of sorted) {
      items.push({
        label: `${p.id === active?.id ? '✓ ' : ' '}${p.name}${p.available ? '' : '  (missing)'}`,
        run: () => void A.switchProject(p.id)
      });
    }
    if (sorted.length) items.push({ separator: true });
    items.push(
      { label: 'New Project…', run: () => void A.createProject() },
      { label: 'Open Folder as Project…', run: () => void A.openFolderAsProject() },
      { label: 'Import Project from ZIP…', run: () => void A.importZipAsProject() }
    );
    if (active) {
      items.push(
        { separator: true },
        { label: 'Rename Project…', run: () => void A.renameProject(active.id) },
        { label: 'Export Project as ZIP…', run: () => void A.exportProject() },
        { label: 'Manage .gitignore…', run: () => (ui.gitignoreOpen = true) },
        { label: 'Reveal in File Explorer', run: () => void A.revealInExplorer('') },
        { separator: true },
        { label: 'Remove from List', run: () => void A.removeProjectFromList(active.id) },
        { label: 'Delete Project…', danger: true, run: () => void A.deleteProject(active.id) }
      );
    }
    openMenuAt(r.left, r.bottom + 4, items);
  }
</script>

<div class="switcher">
  <button class="current" bind:this={btn} onclick={openProjectMenu} title={projects.active?.rootPath ?? 'Choose a project'}>
    <span class="badge"><Icon name="project" size={15} /></span>
    <span class="text">
      <span class="name">{projects.active?.name ?? 'No project'}</span>
      <span class="path">{projects.active?.rootPath ?? 'Open or create a project'}</span>
    </span>
    <Icon name="chevronDown" size={14} />
  </button>
  <button class="icon-btn" title="Settings (Ctrl+,)" onclick={() => (ui.settingsOpen = true)}>
    <Icon name="settings" />
  </button>
</div>

<style>
  .switcher {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 10px 8px 8px 8px;
    border-bottom: 1px solid var(--border);
  }
  .current {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 6px;
    border: none;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    text-align: left;
  }
  .current:hover {
    background: var(--hover);
  }
  .badge {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: var(--accent);
    color: var(--accent-text);
    flex: none;
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .name {
    font-weight: 650;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .path {
    font-size: 11px;
    color: var(--text-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
  }
</style>
