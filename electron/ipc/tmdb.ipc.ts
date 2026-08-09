/**
 * Handlers IPC du domaine « tmdb » — canal DÉDIÉ à la clé API.
 * La clé complète ne redescend jamais au renderer : lecture = statut
 * masqué uniquement (décision phase 2, voir phase_2.md).
 */
import { ipcMain } from 'electron';

import { IPC } from '@shared/ipc';
import type {
  TmdbDetailsOutcome,
  TmdbKeyStatus,
  TmdbKeyTestResult,
  TmdbLanguageConfig,
  TmdbSearchOutcome,
} from '@shared/dto';
import type { TmdbService } from '../services/tmdb.service';

/**
 * Enregistre les handlers « tmdb ».
 * @param service le service TMDB, ou null si la DB a échoué à s'ouvrir
 *                (statut « non configurée », test « invalid »).
 */
export function registerTmdbIpc(service: TmdbService | null): void {
  ipcMain.handle(IPC.tmdb.getKeyStatus, (): TmdbKeyStatus => {
    return service?.getKeyStatus() ?? { configured: false, maskedKey: null };
  });

  ipcMain.handle(IPC.tmdb.setKey, (_event, key: string): void => {
    service?.setKey(String(key));
  });

  ipcMain.handle(
    IPC.tmdb.testKey,
    async (_event, candidateKey?: string): Promise<TmdbKeyTestResult> => {
      if (!service) {
        return 'invalid';
      }
      return service.testKey(candidateKey === undefined ? undefined : String(candidateKey));
    },
  );

  ipcMain.handle(
    IPC.tmdb.searchMovies,
    async (_event, query: string, year?: number | null): Promise<TmdbSearchOutcome> => {
      if (!service) {
        return { status: 'error', httpStatus: null, results: [] };
      }
      return service.searchMovies(String(query), typeof year === 'number' ? year : null);
    },
  );

  ipcMain.handle(
    IPC.tmdb.getDetails,
    async (_event, tmdbId: number): Promise<TmdbDetailsOutcome> => {
      if (!service) {
        return { status: 'error', httpStatus: null, details: null };
      }
      return service.getMovieDetails(Number(tmdbId));
    },
  );

  ipcMain.handle(IPC.tmdb.getLanguageConfig, (): TmdbLanguageConfig => {
    return (
      service?.getLanguageConfig() ?? { metadataLanguage: 'en-US', trailerLanguage: 'original' }
    );
  });

  ipcMain.handle(IPC.tmdb.setLanguageConfig, (_event, config: TmdbLanguageConfig): void => {
    service?.setLanguageConfig({
      metadataLanguage: String(config.metadataLanguage),
      trailerLanguage: String(config.trailerLanguage),
    });
  });
}
