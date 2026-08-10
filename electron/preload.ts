/**
 * PRELOAD — seul pont entre le renderer (Angular) et le main process.
 * Expose `window.api`, strictement conforme au contrat WindowApi
 * (shared/ipc.ts). Le renderer ne voit jamais ipcRenderer ni Node.
 */
import { contextBridge, ipcRenderer } from 'electron';

import type {
  AdminEditableMediaField,
  AdminTableName,
  ManualEditInput,
  QualifyMovieInput,
  ScanProgress,
  ScanRelinkCandidate,
  TmdbLanguageConfig,
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
    enrichFromTmdb: (mediaId: number, tmdbId: number) =>
      ipcRenderer.invoke(IPC.library.enrichFromTmdb, mediaId, tmdbId),
    updateMovie: (mediaId: number, form: ManualEditInput) =>
      ipcRenderer.invoke(IPC.library.updateMovie, mediaId, form),
  },
  scanner: {
    scan: (full?: boolean) => ipcRenderer.invoke(IPC.scanner.scan, full === true),
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
    updateMediaField: (
      mediaId: number,
      field: AdminEditableMediaField,
      value: string | number | null,
    ) => ipcRenderer.invoke(IPC.admin.updateMediaField, mediaId, field, value),
  },
  vlcUpdate: {
    getState: () => ipcRenderer.invoke(IPC.vlcUpdate.getState),
    check: () => ipcRenderer.invoke(IPC.vlcUpdate.check),
    download: () => ipcRenderer.invoke(IPC.vlcUpdate.download),
  },
  adminLock: {
    hasPassword: () => ipcRenderer.invoke(IPC.adminLock.hasPassword),
    verify: (password: string) => ipcRenderer.invoke(IPC.adminLock.verify, password),
    setPassword: (newPassword: string, currentPassword: string | null) =>
      ipcRenderer.invoke(IPC.adminLock.setPassword, newPassword, currentPassword),
  },
  player: {
    play: (mediaId: number, resume: boolean) =>
      ipcRenderer.invoke(IPC.player.play, mediaId, resume),
    setCompleted: (mediaId: number, completed: boolean) =>
      ipcRenderer.invoke(IPC.player.setCompleted, mediaId, completed),
    // Même mécanique de désinscription que scanner.onProgress.
    onEnded: (listener: (mediaId: number) => void): (() => void) => {
      const wrapped = (_event: unknown, mediaId: number): void => listener(mediaId);
      ipcRenderer.on(IPC.player.ended, wrapped);
      return () => ipcRenderer.removeListener(IPC.player.ended, wrapped);
    },
  },
  tmdb: {
    getKeyStatus: () => ipcRenderer.invoke(IPC.tmdb.getKeyStatus),
    setKey: (key: string) => ipcRenderer.invoke(IPC.tmdb.setKey, key),
    testKey: (candidateKey?: string) => ipcRenderer.invoke(IPC.tmdb.testKey, candidateKey),
    searchMovies: (query: string, year?: number | null) =>
      ipcRenderer.invoke(IPC.tmdb.searchMovies, query, year),
    getDetails: (tmdbId: number) => ipcRenderer.invoke(IPC.tmdb.getDetails, tmdbId),
    getLanguageConfig: () => ipcRenderer.invoke(IPC.tmdb.getLanguageConfig),
    setLanguageConfig: (config: TmdbLanguageConfig) =>
      ipcRenderer.invoke(IPC.tmdb.setLanguageConfig, config),
  },
};

contextBridge.exposeInMainWorld('api', api);
