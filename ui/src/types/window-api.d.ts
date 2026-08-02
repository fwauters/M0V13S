/**
 * Déclaration ambiante de `window.api` pour le renderer.
 * L'API est injectée par le preload Electron (electron/preload.ts) selon le
 * contrat partagé shared/ipc.ts. Elle est OPTIONNELLE : en dev navigateur pur
 * (ng serve ouvert hors Electron), elle est absente — l'ApiService gère ce cas.
 */
import type { WindowApi } from '@shared/ipc';

declare global {
  interface Window {
    /** API IPC exposée par le preload Electron (absente hors Electron). */
    api?: WindowApi;
  }
}

export {};
