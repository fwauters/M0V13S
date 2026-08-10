/**
 * Handlers IPC de la mise à jour de VLC (mode admin — l'UI ne montre la
 * carte que déverrouillée ; côté main, ces opérations sont sans danger :
 * lecture d'état, staging — la bascule n'a lieu qu'au démarrage).
 */
import { ipcMain } from 'electron';

import { IPC } from '@shared/ipc';
import type { VlcUpdaterService } from '../services/vlc-updater.service';

export function registerVlcUpdateIpc(updater: VlcUpdaterService): void {
  ipcMain.handle(IPC.vlcUpdate.getState, () => updater.getState());
  ipcMain.handle(IPC.vlcUpdate.check, () => updater.check());
  ipcMain.handle(IPC.vlcUpdate.download, () => updater.download());
}
