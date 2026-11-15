import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getConfig } from '../../src/main/core/config';
import {
  activateProject,
  createProject,
  deleteProject,
  getProjectRoot,
  listProjects,
  locateProject,
  openFolderAsProject,
  readMeta,
  removeProjectFromList,
  renameProject,
  updateProjectMeta
} from '../../src/main/services/project';
import { exists, tmpWorkspace, write } from '../helpers/tmp';

describe('projects', () => {
  it('creates a project folder with metadata and a README, and activates it', async () => {
    const { dir } = await tmpWorkspace();
    const p = await createProject(dir, 'My Notes');
    expect(p.rootPath).toBe(path.join(dir, 'My Notes'));
    expect(await exists(path.join(dir, 'My Notes', '.mdviewer', 'project.json'))).toBe(true);
    expect(await exists(path.join(dir, 'My Notes', 'README.md'))).toBe(true);
    expect(getConfig().activeProjectId).toBe(p.id);
    expect(p.lastOpenFile).toBe('README.md');
    await expect(createProject(dir, 'My Notes')).rejects.toMatchObject({ code: 'ALREADY_EXISTS' });
    await expect(createProject(dir, 'bad:name')).rejects.toMatchObject({ code: 'INVALID_NAME' });
  });

  it('opens an existing folder as a project without duplicating registry entries', async () => {
    const { dir } = await tmpWorkspace();
    await write(path.join(dir, 'Existing', 'doc.md'), '# doc');
    const a = await openFolderAsProject(path.join(dir, 'Existing'));
    const b = await openFolderAsProject(path.join(dir, 'Existing'));
    expect(a.id).toBe(b.id);
    expect(a.name).toBe('Existing');
    expect(getConfig().projects).toHaveLength(1);
    // Subfolders are NOT projects.
    await write(path.join(dir, 'Existing', 'sub', 'x.md'), '');
    expect(await listProjects()).toHaveLength(1);
  });

  it('gives a copied project folder a new id', async () => {
    const { dir } = await tmpWorkspace();
    const a = await createProject(dir, 'A');
    await fs.cp(path.join(dir, 'A'), path.join(dir, 'A copy'), { recursive: true });
    const b = await openFolderAsProject(path.join(dir, 'A copy'));
    expect(b.id).not.toBe(a.id);
    expect(getConfig().projects).toHaveLength(2);
    expect((await readMeta(path.join(dir, 'A copy')))!.id).toBe(b.id);
  });

  it('rejects a drive root', async () => {
    await tmpWorkspace();
    const driveRoot = path.parse(process.cwd()).root;
    await expect(openFolderAsProject(driveRoot)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('renames (display name only), removes from list and deletes', async () => {
    const { dir } = await tmpWorkspace();
    const p = await createProject(dir, 'Proj');
    const r = await renameProject(p.id, 'Renamed');
    expect(r.name).toBe('Renamed');
    expect(await exists(path.join(dir, 'Proj'))).toBe(true);
    expect((await listProjects())[0].name).toBe('Renamed');

    await removeProjectFromList(p.id);
    expect(getConfig().projects).toHaveLength(0);
    expect(await exists(path.join(dir, 'Proj'))).toBe(true);

    const again = await openFolderAsProject(path.join(dir, 'Proj'));
    await deleteProject(again.id);
    expect(await exists(path.join(dir, 'Proj'))).toBe(false);
    expect(getConfig().projects).toHaveLength(0);
  });

  it('detects missing folders and can locate them', async () => {
    const { dir } = await tmpWorkspace();
    const p = await createProject(dir, 'Movable');
    await fs.rename(path.join(dir, 'Movable'), path.join(dir, 'Moved'));
    expect((await listProjects())[0].available).toBe(false);
    await expect(activateProject(p.id)).rejects.toMatchObject({ code: 'PROJECT_UNAVAILABLE' });
    const located = await locateProject(p.id, path.join(dir, 'Moved'));
    expect(located.id).toBe(p.id);
    expect(await getProjectRoot(p.id)).toBe(path.join(dir, 'Moved'));
  });

  it('sanitises metadata patches', async () => {
    const { dir } = await tmpWorkspace();
    const p = await createProject(dir, 'Meta');
    const u = await updateProjectMeta(p.id, {
      lastOpenFile: '../../evil.md',
      recentFiles: ['a.md', '../b.md', 'a.md', 'c/d.md'],
      expandedFolders: ['c'],
      settings: { viewMode: 'preview' }
    });
    expect(u.lastOpenFile).toBeNull();
    expect(u.recentFiles).toEqual(['a.md', 'c/d.md']);
    expect(u.settings.viewMode).toBe('preview');
    expect(u.id).toBe(p.id);
  });
});
