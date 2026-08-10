/**
 * CONTRAT IPC — source de vérité unique des échanges main <-> renderer.
 *
 * Règle d'or (CLAUDE.md) : toute nouvelle API IPC commence ICI.
 * 1. Déclarer le canal dans `IPC` et ses types de requête/réponse
 *    (DTO dans shared/dto.ts).
 * 2. Implémenter le handler côté main (electron/ipc/*.ipc.ts).
 * 3. Exposer la méthode côté preload (electron/preload.ts).
 * Le renderer ne voit que `window.api`, jamais ipcRenderer directement.
 */
import type {
  AdminEditableMediaField,
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
  VlcUpdateCheckOutcome,
  VlcUpdateDownloadStatus,
  VlcUpdaterState,
  WatchStateInfo,
} from './dto';

/** Noms des canaux IPC, groupés par domaine. */
export const IPC = {
  system: {
    /** Ping de diagnostic : prouve la chaîne UI -> preload -> main -> DB. */
    ping: 'system:ping',
  },
  settings: {
    /** Lecture d'une préférence d'UI (clés autorisées : UiSettingKey). */
    get: 'settings:get',
    /** Écriture d'une préférence d'UI. */
    set: 'settings:set',
  },
  library: {
    /** Scan rapide de conformité (lancement) — aucun import. */
    checkConformity: 'library:check-conformity',
    /** Liste des films affichables (présents ET reconnus). */
    listMovies: 'library:list-movies',
    /** Fiche détaillée d'un film. */
    getMovie: 'library:get-movie',
    /** Racines de bibliothèque (chemins relatifs au lecteur). */
    getRoots: 'library:get-roots',
    setRoots: 'library:set-roots',
    /** Ré-enrichit une fiche existante depuis un film TMDB choisi. */
    enrichFromTmdb: 'library:enrich-from-tmdb',
    /** Édition manuelle d'une fiche (formulaire de la page fiche). */
    updateMovie: 'library:update-movie',
  },
  scanner: {
    /** Scan complet (mode Scanner) : nouveaux / manquants / renommés. */
    scan: 'scanner:scan',
    /** Événement de progression du scan (main -> renderer). */
    progress: 'scanner:progress',
    /** Annulation du scan en cours. */
    cancel: 'scanner:cancel',
    /** Qualification manuelle d'un nouveau fichier (création de fiche). */
    qualify: 'scanner:qualify',
    /** Re-lien d'un fichier renommé sur sa fiche existante. */
    relink: 'scanner:relink',
    /** Suppression d'une fiche (sur confirmation UI uniquement). */
    deleteMedia: 'scanner:delete-media',
  },
  admin: {
    /** Lecture d'une table pour la vue admin (lecture seule, liste blanche). */
    readTable: 'admin:read-table',
    /** Édition contrôlée d'un champ de `media` (liste blanche, via
     *  updateMovieManual — fiche + .nfo réécrits, jamais de SQL direct). */
    updateMediaField: 'admin:update-media-field',
  },
  vlcUpdate: {
    /** État du lecteur embarqué (version installée / en attente). */
    getState: 'vlc-update:get-state',
    /** Vérifie la dernière version publiée (en ligne). */
    check: 'vlc-update:check',
    /** Télécharge en staging (bascule au prochain démarrage). */
    download: 'vlc-update:download',
  },
  adminLock: {
    /** Vrai si un mot de passe admin est défini. */
    hasPassword: 'admin-lock:has-password',
    /** Vérifie un mot de passe de déverrouillage. */
    verify: 'admin-lock:verify',
    /** Définit/remplace le mot de passe (l'actuel est exigé s'il existe). */
    setPassword: 'admin-lock:set-password',
  },
  player: {
    /** Lance la lecture VLC d'un film (reprise optionnelle). */
    play: 'player:play',
    /** Marquage manuel vu / pas vu depuis l'UI. */
    setCompleted: 'player:set-completed',
    /** Événement (main -> renderer) : la lecture s'est terminée —
     *  le watch_state a été mis à jour, l'UI doit se rafraîchir. */
    ended: 'player:ended',
  },
  tmdb: {
    /** Statut de la clé API (masquée — jamais la clé en clair). */
    getKeyStatus: 'tmdb:get-key-status',
    /** Enregistre (ou efface, si vide) la clé API. */
    setKey: 'tmdb:set-key',
    /** Teste la validité d'une clé contre l'API TMDB. */
    testKey: 'tmdb:test-key',
    /** Recherche de films (titre + année, langue configurée). */
    searchMovies: 'tmdb:search-movies',
    /** Détails complets d'un film (crédits, trailer), mappés au schéma. */
    getDetails: 'tmdb:get-details',
    /** Préférences de langues (métadonnées + trailer). */
    getLanguageConfig: 'tmdb:get-language-config',
    setLanguageConfig: 'tmdb:set-language-config',
  },
} as const;

/**
 * Clés de réglage accessibles au RENDERER (préférences d'interface).
 * Les clés sensibles (clé TMDB, hash admin) restent côté main
 * et ne transitent que par des canaux dédiés et contrôlés.
 * `app.setupDone` : l'écran de premier lancement a été terminé (phase 5).
 */
export type UiSettingKey = 'ui.theme' | 'ui.lang' | 'app.setupDone';

/** Réponse du ping de diagnostic (étape 0.6). */
export interface SystemPingResult {
  /** Version de l'application (package.json). */
  appVersion: string;
  /** Version d'Electron embarquée. */
  electronVersion: string;
  /** Version de Node du main process. */
  nodeVersion: string;
  /** La base SQLite est ouverte, migrée, et une lecture/écriture a réussi. */
  dbOk: boolean;
  /** Dossier de données actif (diagnostic uniquement — jamais stocké). */
  dataDir: string;
}

/**
 * Forme de l'API exposée au renderer par le preload sous `window.api`.
 * Le renderer y accède via l'ApiService Angular (jamais en direct).
 */
export interface WindowApi {
  system: {
    ping(): Promise<SystemPingResult>;
  };
  settings: {
    /** Lit une préférence d'UI (null si jamais écrite ou DB indisponible). */
    get(key: UiSettingKey): Promise<string | null>;
    /** Persiste une préférence d'UI. */
    set(key: UiSettingKey, value: string): Promise<void>;
  };
  library: {
    checkConformity(): Promise<ConformitySummary>;
    listMovies(): Promise<MovieListItem[]>;
    getMovie(id: number): Promise<MovieDetail | null>;
    getRoots(): Promise<string[]>;
    setRoots(roots: string[]): Promise<void>;
    /** Ré-enrichit une fiche depuis un tmdbId choisi (fiche + .nfo + images). */
    enrichFromTmdb(
      mediaId: number,
      tmdbId: number,
    ): Promise<{ status: TmdbCallStatus; httpStatus: number | null }>;
    /** Édition manuelle : met à jour la fiche + .nfo + regroupement. */
    updateMovie(mediaId: number, form: ManualEditInput): Promise<boolean>;
  };
  scanner: {
    /** Scan des racines ; `full` repasse aussi les fichiers déjà indexés
     *  dans l'assistant (leur enregistrement met la fiche à jour). */
    scan(full?: boolean): Promise<ScanResult>;
    /** S'abonne à la progression du scan ; retourne la désinscription. */
    onProgress(listener: (progress: ScanProgress) => void): () => void;
    cancel(): Promise<void>;
    qualify(input: QualifyMovieInput): Promise<number>;
    relink(candidate: ScanRelinkCandidate): Promise<void>;
    deleteMedia(mediaId: number): Promise<void>;
  };
  admin: {
    readTable(table: AdminTableName): Promise<AdminTableData>;
    /** Faux si fiche inconnue ou champ hors liste blanche. */
    updateMediaField(
      mediaId: number,
      field: AdminEditableMediaField,
      value: string | number | null,
    ): Promise<boolean>;
  };
  vlcUpdate: {
    getState(): Promise<VlcUpdaterState>;
    check(): Promise<VlcUpdateCheckOutcome>;
    download(): Promise<VlcUpdateDownloadStatus>;
  };
  adminLock: {
    hasPassword(): Promise<boolean>;
    verify(password: string): Promise<boolean>;
    /** Retourne faux si l'actuel est incorrect ou le nouveau vide. */
    setPassword(newPassword: string, currentPassword: string | null): Promise<boolean>;
  };
  player: {
    /** Lance VLC sur le premier fichier présent du film.
     *  `resume` vrai = reprendre à la position sauvegardée. */
    play(mediaId: number, resume: boolean): Promise<PlayOutcome>;
    /** Marque vu / pas vu et retourne le nouvel état. */
    setCompleted(mediaId: number, completed: boolean): Promise<WatchStateInfo>;
    /** S'abonne à la fin de lecture ; retourne la désinscription. */
    onEnded(listener: (mediaId: number) => void): () => void;
  };
  tmdb: {
    getKeyStatus(): Promise<TmdbKeyStatus>;
    setKey(key: string): Promise<void>;
    /** Teste la clé fournie, ou la clé stockée si omise. */
    testKey(candidateKey?: string): Promise<TmdbKeyTestResult>;
    searchMovies(query: string, year?: number | null): Promise<TmdbSearchOutcome>;
    getDetails(tmdbId: number): Promise<TmdbDetailsOutcome>;
    getLanguageConfig(): Promise<TmdbLanguageConfig>;
    setLanguageConfig(config: TmdbLanguageConfig): Promise<void>;
  };
}
