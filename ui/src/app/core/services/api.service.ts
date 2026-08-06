import { Injectable } from '@angular/core';
import type {
  AdminTableData,
  AdminTableName,
  ConformitySummary,
  MovieDetail,
  MovieListItem,
  QualifyMovieInput,
  ScanProgress,
  ScanRelinkCandidate,
  ScanResult,
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

  /* ------------------------ scanner ------------------------- */

  /** Scan complet (mode Scanner). */
  async scan(): Promise<ScanResult> {
    return (
      window.api?.scanner.scan() ?? {
        newFiles: [],
        missingFiles: [],
        relinkCandidates: [],
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
}
