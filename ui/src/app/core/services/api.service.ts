import { Injectable } from '@angular/core';
import type {
  AdminTableData,
  AdminTableName,
  ConformitySummary,
  ManualEditInput,
  MovieDetail,
  MovieListItem,
  PlayOutcome,
  QualifyMovieInput,
  ScanProgress,
  ScanRelinkCandidate,
  ScanResult,
  TmdbCallStatus,
  TmdbDetailsOutcome,
  TmdbKeyStatus,
  TmdbKeyTestResult,
  TmdbLanguageConfig,
  TmdbSearchOutcome,
  WatchStateInfo,
} from '@shared/dto';
import type { SystemPingResult, UiSettingKey } from '@shared/ipc';

/**
 * Façade Angular unique vers l'API IPC exposée par le preload Electron
 * (`window.api`, contrat : shared/ipc.ts).
 *
 * Règle (CLAUDE.md) : les composants et stores n'accèdent JAMAIS à
 * `window.api` directement — toujours via ce service, qui gère aussi le cas
 * « hors Electron » (ng serve ouvert dans un simple navigateur) en
 * retournant des valeurs neutres.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  /** Vrai quand l'app tourne dans Electron (preload présent). */
  readonly available: boolean = window.api !== undefined;

  /* ------------------------- system ------------------------- */

  /** Ping de diagnostic : traverse preload -> main -> SQLite et revient. */
  async pingSystem(): Promise<SystemPingResult | null> {
    return window.api?.system.ping() ?? null;
  }

  /* ------------------------ settings ------------------------ */

  /** Lit une préférence d'UI persistée (null hors Electron ou si absente). */
  async getSetting(key: UiSettingKey): Promise<string | null> {
    return window.api?.settings.get(key) ?? null;
  }

  /** Persiste une préférence d'UI (silencieux hors Electron). */
  async setSetting(key: UiSettingKey, value: string): Promise<void> {
    await window.api?.settings.set(key, value);
  }

  /* ------------------------ library ------------------------- */

  /** Scan rapide de conformité (lancement). Hors Electron : scan forcé. */
  async checkConformity(): Promise<ConformitySummary> {
    return (
      window.api?.library.checkConformity() ?? {
        recognizedCount: 0,
        missingCount: 0,
        toQualifyCount: 0,
        forcedScan: true,
      }
    );
  }

  /** Films affichables (présents ET reconnus). */
  async listMovies(): Promise<MovieListItem[]> {
    return window.api?.library.listMovies() ?? [];
  }

  /** Fiche détaillée d'un film. */
  async getMovie(id: number): Promise<MovieDetail | null> {
    return window.api?.library.getMovie(id) ?? null;
  }

  /** Racines de bibliothèque (relatives au lecteur). */
  async getLibraryRoots(): Promise<string[]> {
    return window.api?.library.getRoots() ?? [];
  }

  /** Remplace les racines de bibliothèque. */
  async setLibraryRoots(roots: string[]): Promise<void> {
    await window.api?.library.setRoots(roots);
  }

  /** Édition manuelle d'une fiche (met à jour fiche + .nfo + regroupement). */
  async updateMovie(mediaId: number, form: ManualEditInput): Promise<boolean> {
    return window.api?.library.updateMovie(mediaId, form) ?? false;
  }

  /** Ré-enrichit une fiche depuis un film TMDB choisi (fiche + .nfo + images). */
  async enrichFromTmdb(
    mediaId: number,
    tmdbId: number,
  ): Promise<{ status: TmdbCallStatus; httpStatus: number | null }> {
    return (
      window.api?.library.enrichFromTmdb(mediaId, tmdbId) ?? {
        status: 'error',
        httpStatus: null,
      }
    );
  }

  /* ------------------------ scanner ------------------------- */

  /**
   * Scan des racines (mode Scanner).
   * @param full vrai = scan complet forcé : les fichiers déjà indexés
   *             repassent dans l'assistant (mise à jour de fiche)
   */
  async scan(full = false): Promise<ScanResult> {
    return (
      window.api?.scanner.scan(full) ?? {
        newFiles: [],
        missingFiles: [],
        relinkCandidates: [],
        importedFromNfo: [],
      }
    );
  }

  /** Abonnement à la progression du scan ; retourne la désinscription. */
  onScanProgress(listener: (progress: ScanProgress) => void): () => void {
    return window.api?.scanner.onProgress(listener) ?? (() => undefined);
  }

  /** Annule le scan en cours. */
  async cancelScan(): Promise<void> {
    await window.api?.scanner.cancel();
  }

  /** Qualifie un nouveau fichier (création de fiche). */
  async qualify(input: QualifyMovieInput): Promise<number | null> {
    return window.api?.scanner.qualify(input) ?? null;
  }

  /** Re-lie un fichier renommé sur sa fiche existante. */
  async relink(candidate: ScanRelinkCandidate): Promise<void> {
    await window.api?.scanner.relink(candidate);
  }

  /** Supprime une fiche (après confirmation UI uniquement). */
  async deleteMedia(mediaId: number): Promise<void> {
    await window.api?.scanner.deleteMedia(mediaId);
  }

  /* ------------------------- admin -------------------------- */

  /** Contenu d'une table pour la vue admin (lecture seule). */
  async readAdminTable(table: AdminTableName): Promise<AdminTableData> {
    return window.api?.admin.readTable(table) ?? { columns: [], rows: [], totalCount: 0 };
  }

  /* ------------------------- player ------------------------- */

  /** Lance la lecture VLC (reprise optionnelle). Hors Electron : erreur. */
  async playMovie(mediaId: number, resume: boolean): Promise<PlayOutcome> {
    return window.api?.player.play(mediaId, resume) ?? { status: 'error' };
  }

  /** Marque vu / pas vu (manuel) et retourne le nouvel état. */
  async setWatchCompleted(mediaId: number, completed: boolean): Promise<WatchStateInfo> {
    return (
      window.api?.player.setCompleted(mediaId, completed) ?? {
        completed: false,
        watchCount: 0,
        resumePositionSec: null,
        lastWatchedAt: null,
      }
    );
  }

  /** S'abonne à la fin de lecture VLC ; retourne la désinscription. */
  onPlaybackEnded(listener: (mediaId: number) => void): () => void {
    return window.api?.player.onEnded(listener) ?? (() => undefined);
  }

  /* -------------------------- tmdb -------------------------- */

  /** Statut (masqué) de la clé API TMDB. */
  async getTmdbKeyStatus(): Promise<TmdbKeyStatus> {
    return window.api?.tmdb.getKeyStatus() ?? { configured: false, maskedKey: null };
  }

  /** Enregistre (ou efface, si vide) la clé API TMDB. */
  async setTmdbKey(key: string): Promise<void> {
    await window.api?.tmdb.setKey(key);
  }

  /** Teste la clé fournie (ou la clé stockée) contre l'API TMDB. */
  async testTmdbKey(candidateKey?: string): Promise<TmdbKeyTestResult> {
    return window.api?.tmdb.testKey(candidateKey) ?? 'offline';
  }

  /** Recherche TMDB (titre + année, langue configurée). */
  async searchTmdb(query: string, year?: number | null): Promise<TmdbSearchOutcome> {
    return (
      window.api?.tmdb.searchMovies(query, year) ?? {
        status: 'error',
        httpStatus: null,
        results: [],
      }
    );
  }

  /** Détails complets d'un film TMDB, mappés vers notre schéma. */
  async getTmdbDetails(tmdbId: number): Promise<TmdbDetailsOutcome> {
    return (
      window.api?.tmdb.getDetails(tmdbId) ?? {
        status: 'error',
        httpStatus: null,
        details: null,
      }
    );
  }

  /** Préférences de langues TMDB (métadonnées + trailer). */
  async getTmdbLanguageConfig(): Promise<TmdbLanguageConfig> {
    return (
      window.api?.tmdb.getLanguageConfig() ?? {
        metadataLanguage: 'en-US',
        trailerLanguage: 'original',
      }
    );
  }

  /** Enregistre les préférences de langues TMDB. */
  async setTmdbLanguageConfig(config: TmdbLanguageConfig): Promise<void> {
    await window.api?.tmdb.setLanguageConfig(config);
  }
}
