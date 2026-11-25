<script lang="ts">
  import { doc, projects, tree, ui, DRAG_TYPE } from '../lib/state.svelte';
  import { openMenu } from '../lib/dialogs';
  import { basename, dirname } from '../lib/util/paths';
  import * as A from '../lib/actions';
  import Icon from './Icon.svelte';
  import ProjectSwitcher from './ProjectSwitcher.svelte';
  import TreeNode from './TreeNode.svelte';
  import SearchPanel from './SearchPanel.svelte';

  let recentOpen = $state(true);

  const recent = $derived(projects.active?.recentFiles ?? []);

  function startResize(e: PointerEvent) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      ui.sidebarWidth = Math.max(180, Math.min(600, ev.clientX));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      A.persistSidebar();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }

  function rootMenu(e: MouseEvent) {
    openMenu(e, [
      { label: 'New File…', shortcut: 'Ctrl+N', run: () => void A.newFile('') },
      { label: 'New Folder…', run: () => void A.newFolder('') },
      { label: 'Import .md / .zip Here…', run: () => void A.importIntoProject('') },
      { separator: true },
      { label: 'Refresh', run: () => void A.refreshTree() },
      { label: 'Reveal Project in File Explorer', run: () => void A.revealInExplorer('') }
    ]);
  }

  function collapseAll() {
    tree.expanded.clear();
    A.toggleFolder('', false);
  }

  function rootDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    tree.dropTarget = '';
  }
  function rootDrop(e: DragEvent) {
    const src = e.dataTransfer?.getData(DRAG_TYPE);
    tree.dropTarget = null;
    if (src) {
      e.preventDefault();
      void A.moveEntry(src, '');
    }
  }
</script>

<aside class="sidebar" style="width:{ui.sidebarWidth}px">
  <ProjectSwitcher />

  {#if projects.active && ui.searchOpen}
    <SearchPanel />
  {:else if projects.active}
    {#if recent.length}
      <div class="section">
        <button class="section-title" onclick={() => (recentOpen = !recentOpen)}>
          <span class="chev" class:open={recentOpen}><Icon name="chevron" size={11} stroke={2.4} /></span>
          Recent
        </button>
      </div>
      {#if recentOpen}
        <div class="recent">
          {#each recent.slice(0, 6) as path (path)}
            <button class="recent-item" class:active={doc.path === path} title={path} onclick={() => A.openFile(path)}>
              <Icon name="clock" size={13} />
              <span class="rname">{basename(path)}</span>
              {#if dirname(path)}<span class="rdir">{dirname(path)}</span>{/if}
            </button>
          {/each}
        </div>
      {/if}
    {/if}

    <div class="section files-head">
      <span class="section-title static">Files</span>
      <div class="tools">
        <button class="icon-btn" title="Search Documents (Ctrl+Shift+F)" onclick={() => A.openSearch()}><Icon name="search" size={15} /></button>
        <button class="icon-btn" title="New File (Ctrl+N)" onclick={() => A.newFile('')}><Icon name="filePlus" size={15} /></button>
        <button class="icon-btn" title="New Folder" onclick={() => A.newFolder('')}><Icon name="folderPlus" size={15} /></button>
        <button class="icon-btn" title="Refresh" onclick={() => A.refreshTree()}><Icon name="refresh" size={15} /></button>
        <button class="icon-btn" title="Collapse All" onclick={collapseAll}><Icon name="collapse" size={15} /></button>
      </div>
    </div>

    <div
      class="tree"
      class:drop={tree.dropTarget === ''}
      role="tree"
      tabindex="-1"
      oncontextmenu={rootMenu}
      ondragover={rootDragOver}
      ondragleave={(e) => e.target === e.currentTarget && tree.dropTarget === '' && (tree.dropTarget = null)}
      ondrop={rootDrop}
    >
      {#if tree.root}
        {#each tree.root.children ?? [] as child (child.path)}
          <TreeNode node={child} depth={0} />
        {:else}
          <div class="empty">
            <p>This project is empty.</p>
            <button class="btn" onclick={() => A.newFile('')}>Create a file</button>
          </div>
        {/each}
      {/if}
    </div>
  {:else}
    <div class="empty">
      <p>No project is open.</p>
    </div>
  {/if}

  <div class="resizer" role="separator" aria-orientation="vertical" onpointerdown={startResize}></div>
</aside>

<style>
  .sidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: none;
    min-width: 180px;
    height: 100%;
    background: var(--bg-sidebar);
    border-right: 1px solid var(--border);
  }
  .section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 8px 4px 10px;
  }
  .section-title {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px;
    border: none;
    background: transparent;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    cursor: pointer;
  }
  .section-title.static {
    cursor: default;
  }
  .chev {
    display: grid;
    transition: transform 0.12s;
  }
  .chev.open {
    transform: rotate(90deg);
  }
  .tools {
    display: flex;
    gap: 1px;
  }
  .recent {
    display: flex;
    flex-direction: column;
    padding: 0 6px 6px;
    border-bottom: 1px solid var(--border);
  }
  .recent-item {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 25px;
    padding: 0 8px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }
  .recent-item:hover {
    background: var(--hover);
    color: var(--text);
  }
  .recent-item.active {
    color: var(--accent);
  }
  .rname {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: none;
    max-width: 60%;
  }
  .rdir {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .files-head {
    padding-top: 10px;
  }
  .tree {
    flex: 1;
    overflow: auto;
    padding: 2px 0 24px;
    outline: none;
  }
  .tree.drop {
    background: var(--accent-soft);
  }
  .empty {
    padding: 16px;
    color: var(--text-muted);
    text-align: center;
  }
  .resizer {
    position: absolute;
    top: 0;
    right: -3px;
    width: 6px;
    height: 100%;
    cursor: col-resize;
    z-index: 5;
  }
  .resizer:hover {
    background: var(--accent);
    opacity: 0.4;
  }
</style>
