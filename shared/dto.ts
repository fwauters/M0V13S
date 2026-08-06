/**
 * DTO partagés main <-> renderer (source de vérité des types métier côté
 * contrat IPC). Complète shared/ipc.ts qui porte les canaux.
 */

/** Données techniques d'un fichier vidéo (null = non détecté/non analysé). */
export interface TechInfo {
  durationSec: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
}

/* ------------------------------------------------------------------ */
/* Conformité (scan rapide du lancement — PLAN § 6.1)                  */
/* ------------------------------------------------------------------ */

/** Résumé du scan de conformité exécuté à chaque lancement. */
export interface ConformitySummary {
  /** Fichiers présents sur le disque ET reconnus par l'index (affichables). */
  recognizedCount: number;
  /** Fichiers indexés mais introuvables sur le disque (masqués, `missing`). */
  missingCount: number;
  /** Fichiers présents mais inconnus de l'index (notice « à qualifier »). */
  toQualifyCount: number;
  /** Vrai si RIEN n'est reconnu → mode Scanner forcé (pas de mode classique). */
  forcedScan: boolean;
}

/* ------------------------------------------------------------------ */
/* Scanner (mode admin — PLAN § 6.2)                                   */
/* ------------------------------------------------------------------ */

/** Un nouveau fichier détecté, prêt pour l'assistant de qualification. */
export interface ScanNewFile {
  relPath: string;
  sizeBytes: number;
  mtimeMs: number;
  /** Analyse ffprobe (null si l'analyse a échoué — fichier suspect). */
  tech: TechInfo | null;
  /** Préremplissage deviné depuis le nom de fichier. */
  guess: {
    title: string;
    year: number | null;
    partNumber: number | null;
    looksLikeEpisode: boolean;
  };
}

/** Un fichier indexé devenu introuvable (suppression sur confirmation). */
export interface ScanMissingFile {
  videoFileId: number;
  mediaId: number;
  relPath: string;
  mediaTitle: string;
}

/** Renommage probable : un disparu et un nouveau de même taille/durée. */
export interface ScanRelinkCandidate {
  videoFileId: number;
  mediaTitle: string;
  oldRelPath: string;
  newRelPath: string;
  newSizeBytes: number;
  newMtimeMs: number;
}

/** Fichier importé SILENCIEUSEMENT depuis son sidecar `.nfo` (PLAN § 6.2.2). */
export interface ScanImportedFile {
  relPath: string;
  /** Titre d'affichage de la fiche créée/complétée (VF sinon VO). */
  title: string;
}

/** Résultat complet d'un scan (mode Scanner). */
export interface ScanResult {
  newFiles: ScanNewFile[];
  missingFiles: ScanMissingFile[];
  relinkCandidates: ScanRelinkCandidate[];
  /** Fichiers arrivés avec leur `.nfo` : importés sans question, hors ligne. */
  importedFromNfo: ScanImportedFile[];
}

/** Progression du scan (analyse ffprobe des nouveaux fichiers). */
export interface ScanProgress {
  done: number;
  total: number;
  /** Fichier en cours d'analyse (relPath). */
  current: string;
}

/** Un acteur saisi/importé (le personnage vient des `.nfo` et de TMDB). */
export interface QualifyActor {
  name: string;
  character: string | null;
}

/**
 * Saisie de l'assistant de qualification (fiche manuelle, import `.nfo`,
 * ou préremplissage TMDB). Tout est modifiable par l'utilisateur.
 */
export interface QualifyMovieInput {
  /** Fichier concerné (identité disque). */
  relPath: string;
  sizeBytes: number;
  mtimeMs: number;
  tech: TechInfo | null;
  partNumber: number | null;
  /** Champs de la fiche. */
  titleVo: string;
  titleVf: string | null;
  year: number | null;
  overview: string | null;
  personalRating: number | null;
  /** Identifiant TMDB (import `.nfo` ou enrichissement) — déduplique les
   *  fiches multi-fichiers. Null pour une saisie purement manuelle. */
  tmdbId: number | null;
  directors: string[];
  writers: string[];
  actors: QualifyActor[];
  genres: string[];
  tags: string[];
}

/* ------------------------------------------------------------------ */
/* TMDB (enrichissement — PLAN § 6.2, clé gérée dans l'app)            */
/* ------------------------------------------------------------------ */

/**
 * Statut de la clé API TMDB, tel qu'exposé au renderer.
 * La clé COMPLÈTE ne redescend jamais : seulement une version masquée.
 */
export interface TmdbKeyStatus {
  configured: boolean;
  /** Derniers caractères de la clé (ex. « ****3f2a »), null si absente. */
  maskedKey: string | null;
}

/** Résultat du test de validité de la clé (bouton « Tester »). */
export type TmdbKeyTestResult = 'valid' | 'invalid' | 'offline';

/* ------------------------------------------------------------------ */
/* Bibliothèque (mode classique — liste et fiches)                     */
/* ------------------------------------------------------------------ */

/** Élément de la liste des films (règle : présent ET reconnu uniquement). */
export interface MovieListItem {
  id: number;
  titleVo: string;
  titleVf: string | null;
  year: number | null;
  durationSec: number | null;
  genres: string[];
}

/** Personne d'une fiche, avec son rôle. */
export interface MoviePerson {
  name: string;
  role: 'director' | 'writer' | 'actor';
  character: string | null;
}

/** Fiche détaillée d'un film. */
export interface MovieDetail {
  id: number;
  titleVo: string;
  titleVf: string | null;
  year: number | null;
  overview: string | null;
  personalRating: number | null;
  genres: string[];
  tags: string[];
  people: MoviePerson[];
  files: Array<{
    id: number;
    relPath: string;
    sizeBytes: number;
    partNumber: number | null;
    status: 'ok' | 'missing';
    tech: TechInfo;
  }>;
}

/* ------------------------------------------------------------------ */
/* Vue admin des tables (ag-grid, lecture seule en phase 1)            */
/* ------------------------------------------------------------------ */

/** Tables exposées à la vue admin (liste blanche côté main). */
export type AdminTableName =
  | 'settings'
  | 'media'
  | 'seasons'
  | 'episodes'
  | 'video_files'
  | 'people'
  | 'media_people'
  | 'genres'
  | 'media_genres'
  | 'tags'
  | 'media_tags'
  | 'watch_state';

/** Contenu d'une table pour la grille admin (lecture seule). */
export interface AdminTableData {
  /** Noms de colonnes, dans l'ordre du schéma. */
  columns: string[];
  /** Lignes brutes (valeurs primitives sérialisables). */
  rows: Array<Record<string, unknown>>;
  /** Nombre total de lignes dans la table (les rows peuvent être tronquées). */
  totalCount: number;
}
