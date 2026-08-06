/**
 * Handlers IPC des domaines « library », « scanner » et « admin ».
 * Contrat : shared/ipc.ts. Tous tolèrent une DB indisponible (l'UI
 * affiche alors l'état dégradé au lieu de planter).
 */
import { BrowserWindow, ipcMain } from 'electron';

import type {
  AdminTableName,
  QualifyMovieInput,
  ScanRelinkCandidate,
} from '@shared/dto';
import { IPC } from '@shared/ipc';
import type { AdminTablesService } from '../services/admin-tables.service';
import type { ConformityService } from '../services/conformity.service';
import type { LibraryService } from '../services/library.service';
import type { ScannerService } from '../services/scanner.service';
import type { SettingsService } from '../services/settings.service';

/** Ensemble des services métier requis par ces handlers (null = DB KO). */
export interface LibraryIpcServices {
  conformity: ConformityService;
  library: LibraryService;
  scanner: ScannerService;
  settings: SettingsService;
  adminTables: AdminTablesService;
}

export function registerLibraryIpc(services: LibraryIpcServices | null): void {
  /* ---------------------- library ---------------------- */

  ipcMain.handle(IPC.library.checkConformity, () => {
    if (!services) {
      // DB indisponible : rien de reconnu → l'UI force le mode Scanner,
      // qui affichera l'erreur de fond.
      return { recognizedCount: 0, missingCount: 0, toQualifyCount: 0, forcedScan: true };
    }
    return services.conformity.run();
  });

  ipcMain.handle(IPC.library.listMovies, () => services?.library.listMovies() ?? []);

  ipcMain.handle(IPC.library.getMovie, (_e, id: number) =>
    services?.library.getMovie(Number(id)) ?? null,
  );

  ipcMain.handle(IPC.library.getRoots, () => services?.settings.getLibraryRoots() ?? []);

  ipcMain.handle(IPC.library.setRoots, (_e, roots: string[]) => {
    // Validation minimale : tableau de chemins relatifs non vides.
    const clean = (Array.isArray(roots) ? roots : [])
      .map((r) => String(r).trim())
      .filter((r) => r !== '');
    services?.settings.setLibraryRoots(clean);
  });

  /* ---------------------- scanner ---------------------- */

  ipcMain.handle(IPC.scanner.scan, async (event, full?: boolean) => {
    if (!services) {
      return { newFiles: [], missingFiles: [], relinkCandidates: [], importedFromNfo: [] };
    }
    // La progression est poussée vers la fenêtre appelante.
    const win = BrowserWindow.fromWebContents(event.sender);
    return services.scanner.scan(
      (progress) => {
        win?.webContents.send(IPC.scanner.progress, progress);
      },
      // `full` : scan complet forcé (les fichiers indexés repassent
      // dans l'assistant pour mise à jour de fiche).
      { full: full === true },
    );
  });

  ipcMain.handle(IPC.scanner.cancel, () => services?.scanner.cancel());

  ipcMain.handle(IPC.scanner.qualify, (_e, input: QualifyMovieInput) => {
    if (!services) {
      throw new Error('Base de données indisponible : qualification impossible.');
    }
    return services.scanner.qualify(input);
  });

  ipcMain.handle(IPC.scanner.relink, (_e, candidate: ScanRelinkCandidate) =>
    services?.scanner.relink(
      candidate.videoFileId,
      candidate.newRelPath,
      candidate.newSizeBytes,
      candidate.newMtimeMs,
    ),
  );

  ipcMain.handle(IPC.scanner.deleteMedia, (_e, mediaId: number) =>
    services?.scanner.deleteMedia(Number(mediaId)),
  );

  /* ----------------------- admin ----------------------- */

  ipcMain.handle(IPC.admin.readTable, (_e, table: AdminTableName) => {
    if (!services) {
      return { columns: [], rows: [], totalCount: 0 };
    }
    return services.adminTables.readTable(table);
  });
}
