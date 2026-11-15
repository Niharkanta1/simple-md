// Minimal stroke icon set (24x24 viewBox).
export const ICONS = {
  chevron: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  folderOpen: 'M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1 M3 7v10a2 2 0 0 0 2 2h12l3-8H7l-3 8',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5',
  fileMd: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M8 17v-4l2 2 2-2v4 M15 13v4 M13.5 15.5L15 17l1.5-1.5',
  image: 'M4 5h16v14H4z M9 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M20 15l-5-5-9 9',
  filePlus: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M12 11v6 M9 14h6',
  folderPlus: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M12 10v6 M9 13h6',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  settings: 'M4 6h9 M17 6h3 M4 12h3 M11 12h9 M4 18h11 M19 18h1 M15 4v4 M9 10v4 M17 16v4',
  sidebar: 'M4 5h16v14H4z M9 5v14',
  x: 'M6 6l12 12 M18 6L6 18',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-4-4',
  eyeOff: 'M3 3l18 18 M10.6 6.1A9.9 9.9 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.6 3.3 M6.6 6.6C4.3 8.1 3 12 3 12s4 6 9 6a9 9 0 0 0 4.4-1.1',
  download: 'M12 4v11 M7 10l5 5 5-5 M5 20h14',
  upload: 'M12 16V5 M7 10l5-5 5 5 M5 20h14',
  edit: 'M4 20h4L19 9l-4-4L4 16z M13 7l4 4',
  columns: 'M4 5h16v14H4z M12 5v14',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  check: 'M5 12l5 5 9-10',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2',
  project: 'M12 3l9 5-9 5-9-5z M3 13l9 5 9-5',
  power: 'M12 3v9 M6.3 6.3a8 8 0 1 0 11.4 0',
  collapse: 'M8 4l4 4 4-4 M8 20l4-4 4 4',
  alert: 'M12 3l10 18H2z M12 10v4 M12 17h.01'
} as const;

export type IconName = keyof typeof ICONS;
