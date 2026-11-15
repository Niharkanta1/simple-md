<script lang="ts">
  import { tick } from 'svelte';
  import type { TreeNode as Node } from '../../../shared/types';
  import { doc, tree, DRAG_TYPE } from '../lib/state.svelte';
  import { openMenu } from '../lib/dialogs';
  import { fileKind, dirname } from '../lib/util/paths';
  import * as A from '../lib/actions';
  import Icon from './Icon.svelte';
  import Self from './TreeNode.svelte';

  let { node, depth }: { node: Node; depth: number } = $props();

  const isDir = $derived(node.type === 'dir');
  const open = $derived(isDir && tree.expanded.has(node.path));
  const active = $derived(doc.path === node.path);
  const ignored = $derived(A.isIgnored(node.path));
  const kind = $derived(isDir ? null : fileKind(node.name));
  const renaming = $derived(tree.renaming === node.path);
  const dropDir = $derived(isDir ? node.path : dirname(node.path));

  let input: HTMLInputElement | undefined = $state();
  let draft = $state('');

  $effect(() => {
    if (renaming) {
      draft = node.name;
      void tick().then(() => {
        if (!input) return;
        input.focus();
        const dot = isDir ? -1 : node.name.lastIndexOf('.');
        input.setSelectionRange(0, dot > 0 ? dot : node.name.length);
      });
    }
  });

  function onClick() {
    tree.selected = node.path;
    if (isDir) A.toggleFolder(node.path);
    else void A.openFile(node.path);
  }

  function menu(e: MouseEvent) {
    tree.selected = node.path;
    const gi = A.hasExactRule(node.path, isDir)
      ? { label: 'Remove from .gitignore', run: () => void A.removeFromGitignore(node.path, isDir) }
      : { label: 'Add to .gitignore', run: () => void A.addToGitignore(node.path, isDir) };
    const common = [
      { label: 'Rename', shortcut: 'F2', run: () => (tree.renaming = node.path) },
      { label: 'Delete', shortcut: 'Del', danger: true, run: () => void A.deleteEntry(node.path) },
      { separator: true },
      gi,
      { separator: true },
      { label: 'Copy Relative Path', run: () => void A.copyRelativePath(node.path) },
      { label: 'Reveal in File Explorer', run: () => void A.revealInExplorer(node.path) }
    ];
    if (isDir) {
      openMenu(e, [
        { label: 'New File…', run: () => void A.newFile(node.path) },
        { label: 'New Folder…', run: () => void A.newFolder(node.path) },
        { label: 'Import .md / .zip Here…', run: () => void A.importIntoProject(node.path) },
        { separator: true },
        ...common
      ]);
    } else {
      openMenu(e, [
        { label: 'Open', run: () => void A.openFile(node.path) },
        ...(kind === 'markdown' ? [{ label: 'Export as ZIP…', run: () => void A.exportFile(node.path) }] : []),
        { separator: true },
        ...common
      ]);
    }
  }

  function commit() {
    if (tree.renaming !== node.path) return;
    void A.commitRename(node.path, draft.trim());
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      tree.renaming = null;
    }
    e.stopPropagation();
  }

  function onDragStart(e: DragEvent) {
    if (!e.dataTransfer) return;
    e.dataTransfer.setData(DRAG_TYPE, node.path);
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    tree.dropTarget = dropDir;
  }
  function onDrop(e: DragEvent) {
    const src = e.dataTransfer?.getData(DRAG_TYPE);
    tree.dropTarget = null;
    if (!src) return;
    e.preventDefault();
    e.stopPropagation();
    void A.moveEntry(src, dropDir);
  }
</script>

<div
  class="row"
  class:active
  class:selected={tree.selected === node.path && !active}
  class:ignored
  class:drop={isDir && tree.dropTarget === node.path}
  style="padding-left: {6 + depth * 14}px"
  role="treeitem"
  aria-selected={active}
  aria-expanded={isDir ? open : undefined}
  tabindex="-1"
  title={node.path}
  draggable={!renaming}
  onclick={onClick}
  onkeydown={(e) => e.key === 'Enter' && onClick()}
  oncontextmenu={menu}
  ondragstart={onDragStart}
  ondragover={onDragOver}
  ondragleave={() => tree.dropTarget === dropDir && (tree.dropTarget = null)}
  ondrop={onDrop}
  ondragend={() => (tree.dropTarget = null)}
>
  <span class="twisty" class:open>
    {#if isDir}<Icon name="chevron" size={12} stroke={2.2} />{/if}
  </span>
  <span class="ficon" class:md={kind === 'markdown'} class:img={kind === 'image'}>
    <Icon name={isDir ? (open ? 'folderOpen' : 'folder') : kind === 'markdown' ? 'fileMd' : kind === 'image' ? 'image' : 'file'} size={15} />
  </span>
  {#if renaming}
    <input
      class="rename"
      bind:this={input}
      bind:value={draft}
      spellcheck="false"
      onkeydown={onKey}
      onblur={commit}
      onclick={(e) => e.stopPropagation()}
    />
  {:else}
    <span class="name">{node.name}</span>
    {#if active && doc.dirty}<span class="dot" title="Unsaved changes"></span>{/if}
  {/if}
</div>

{#if open && node.children}
  {#each node.children as child (child.path)}
    <Self node={child} depth={depth + 1} />
  {/each}
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding-right: 8px;
    margin: 0 6px;
    border-radius: 6px;
    cursor: pointer;
    color: var(--text);
    outline: none;
  }
  .row:hover {
    background: var(--hover);
  }
  .row.selected {
    background: var(--hover);
  }
  .row.active {
    background: var(--active);
    color: var(--accent);
    font-weight: 600;
  }
  .row.ignored .name,
  .row.ignored .ficon {
    opacity: 0.45;
  }
  .row.drop {
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .twisty {
    width: 14px;
    display: grid;
    place-items: center;
    color: var(--text-faint);
    transition: transform 0.12s;
    flex: none;
  }
  .twisty.open {
    transform: rotate(90deg);
  }
  .ficon {
    color: var(--text-muted);
  }
  .ficon.md {
    color: var(--accent);
  }
  .ficon.img {
    color: var(--success);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--warning);
    flex: none;
  }
  .rename {
    flex: 1;
    min-width: 0;
    height: 22px;
    padding: 0 5px;
    border-radius: 4px;
  }
</style>
