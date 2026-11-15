import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ApiMethodName, BridgeApi } from '../shared/api';
import { API_METHODS, EVENTS } from '../shared/api';

const allowed = new Set<string>(API_METHODS);

const api: BridgeApi = {
  invoke(method: ApiMethodName, ...args: unknown[]) {
    if (!allowed.has(method)) return Promise.reject(new Error(`Unknown API method: ${String(method)}`));
    return ipcRenderer.invoke(`api:${method}`, ...args);
  },
  onFsChanged(cb) {
    const listener = (_e: unknown, projectId: string) => cb(projectId);
    ipcRenderer.on(EVENTS.fsChanged, listener);
    return () => ipcRenderer.removeListener(EVENTS.fsChanged, listener);
  },
  onCloseRequested(cb) {
    const listener = () => cb();
    ipcRenderer.on(EVENTS.closeRequested, listener);
    return () => ipcRenderer.removeListener(EVENTS.closeRequested, listener);
  },
  getPathForFile(file: File) {
    return webUtils.getPathForFile(file);
  }
};

contextBridge.exposeInMainWorld('api', api);
