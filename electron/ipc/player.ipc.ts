/**
 * Handlers IPC du domaine « player » : lecture VLC + marquage vu/pas vu.
 * Comme partout : le renderer ne reçoit JAMAIS d'exception — les cas
 * dégradés (DB fermée) répondent par des valeurs neutres.
 */
import { BrowserWindow, ipcMain } from 'electron';

import type { PlayOutcome, WatchStateInfo } from '@shared/dto';
import { IPC } from '@shared/ipc';
import type { VlcService } from '../services/vlc.service';
import type { WatchService } from '../services/watch.service';

/** État neutre renvoyé quand la DB est indisponible. */
const EMPTY_WATCH: WatchStateInfo = {
  completed: false,
  watchCount: 0,
  resumePositionSec: null,
  lastWatchedAt: null,
};

export function registerPlayerIpc(
  services: { vlc: VlcService; watch: WatchService } | null,
): void {
  ipcMain.handle(
    IPC.player.play,
    async (_event, mediaId: number, resume: boolean): Promise<PlayOutcome> => {
      if (services === null) {
        return { status: 'error' };
      }
      return services.vlc.play(mediaId, resume);
    },
  );

  ipcMain.handle(
    IPC.player.setCompleted,
    (_event, mediaId: number, completed: boolean): WatchStateInfo => {
      if (services === null) {
        return EMPTY_WATCH;
      }
      return services.watch.setCompleted(mediaId, completed);
    },
  );

  // Fin de lecture : notifie TOUTES les fenêtres (l'UI recharge la fiche
  // et la bibliothèque — le watch_state vient de changer).
  services?.vlc.onEnded((mediaId) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.player.ended, mediaId);
    }
  });
}
