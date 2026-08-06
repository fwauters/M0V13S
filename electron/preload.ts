/**
 * PRELOAD — seul pont entre le renderer (Angular) et le main process.
 * Expose `window.api`, strictement conforme au contrat WindowApi
 * (shared/ipc.ts). Le renderer ne voit jamais ipcRenderer ni Node.
 */
import { contextBridge, ipcRenderer } from 'electron';

import type {
  AdminTableName,
  QualifyMovieInput,
  ScanProgress,
  ScanRelinkCandidate,
} from '@shared/dto';
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
  library: {
    checkConformity: () => ipcRenderer.invoke(IPC.library.checkConformity),
    listMovies: () => ipcRenderer.invoke(IPC.library.listMovies),
    getMovie: (id: number) => ipcRenderer.invoke(IPC.library.getMovie, id),
    getRoots: () => ipcRenderer.invoke(IPC.library.getRoots),
    setRoots: (roots: string[]) => ipcRenderer.invoke(IPC.library.setRoots, roots),
  },
  scanner: {
    scan: () => ipcRenderer.invoke(IPC.scanner.scan),
    cancel: () => ipcRenderer.invoke(IPC.scanner.cancel),
    qualify: (input: QualifyMovieInput) => ipcRenderer.invoke(IPC.scanner.qualify, input),
    relink: (candidate: ScanRelinkCandidate) =>
      ipcRenderer.invoke(IPC.scanner.relink, candidate),
    deleteMedia: (mediaId: number) => ipcRenderer.invoke(IPC.scanner.deleteMedia, mediaId),
    // Abonnement à la progression (événement main -> renderer) :
    // retourne la fonction de désinscription (à appeler à la destruction
    // du composant pour éviter les fuites d'écouteurs).
    onProgress: (listener: (progress: ScanProgress) => void): (() => void) => {
      const wrapped = (_event: unknown, progress: ScanProgress): void => listener(progress);
      ipcRenderer.on(IPC.scanner.progress, wrapped);
      return () => ipcRenderer.removeListener(IPC.scanner.progress, wrapped);
    },
  },
  admin: {
    readTable: (table: AdminTableName) => ipcRenderer.invoke(IPC.admin.readTable, table),
  },
  tmdb: {
    getKeyStatus: () => ipcRenderer.invoke(IPC.tmdb.getKeyStatus),
    setKey: (key: string) => ipcRenderer.invoke(IPC.tmdb.setKey, key),
    testKey: (candidateKey?: string) => ipcRenderer.invoke(IPC.tmdb.testKey, candidateKey),
  },
};

contextBridge.exposeInMainWorld('api', api);
