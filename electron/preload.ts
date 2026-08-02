/**
 * PRELOAD — seul pont entre le renderer (Angular) et le main process.
 * Expose `window.api`, strictement conforme au contrat WindowApi
 * (shared/ipc.ts). Le renderer ne voit jamais ipcRenderer ni Node.
 */
import { contextBridge, ipcRenderer } from 'electron';

import { IPC, SystemPingResult, UiSettingKey, WindowApi } from '@shared/ipc';

/** Implémentation de l'API : chaque méthode relaye un invoke IPC typé. */
const api: WindowApi = {
  system: {
    ping: (): Promise<SystemPingResult> => ipcRenderer.invoke(IPC.system.ping),
  },
  settings: {
    get: (key: UiSettingKey): Promise<string | null> =>
      ipcRenderer.invoke(IPC.settings.get, key),
    set: (key: UiSettingKey, value: string): Promise<void> =>
      ipcRenderer.invoke(IPC.settings.set, key, value),
  },
};

contextBridge.exposeInMainWorld('api', api);
