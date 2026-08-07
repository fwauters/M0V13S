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

/** Fiche existante d'un fichier déjà indexé (scan complet forcé) :
 *  préremplit l'assistant, et l'enregistrement MET À JOUR la fiche. */
export interface ExistingFiche {
  mediaId: number;
  titleVo: string;
  titleVf: string | null;
  year: number | null;
  overview: string | null;
  personalRating: number | null;
  /** Avis/notes libres de l'utilisateur — jamais écrasés par TMDB. */
  personalNotes: string | null;
  tmdbId: number | null;
  tmdbRating: number | null;
  trailerYoutubeKey: string | null;
  /** Affiche sidecar (chemin relatif) — aperçu dans l'assistant. */
  posterPath: string | null;
  directors: string[];
  writers: string[];
  actors: QualifyActor[];
  genres: string[];
  tags: string[];
}

/** Un fichier proposé à l'assistant de qualification. */
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
  /** Fiche existante si le fichier est déjà indexé (scan complet forcé),
   *  null pour un fichier réellement nouveau. */
  existing: ExistingFiche | null;
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
  /** Avis/notes libres de l'utilisateur — comme la note perso et les
   *  tags : jamais écrasés par TMDB, seulement par l'utilisateur. */
  personalNotes: string | null;
  /** Note moyenne TMDB (0-10) — informative, mise à jour par TMDB. */
  tmdbRating: number | null;
  /** Identifiant TMDB (import `.nfo` ou enrichissement) — déduplique les
   *  fiches multi-fichiers. Null pour une saisie purement manuelle. */
  tmdbId: number | null;
  /** Clé YouTube du trailer (enrichissement TMDB — lecture en phase 3). */
  trailerYoutubeKey: string | null;
  /** Chemins d'images TMDB à télécharger en sidecars (fiche appliquée dans
   *  l'assistant) — null : détection des sidecars existants uniquement. */
  tmdbPosterPath: string | null;
  tmdbBackdropPath: string | null;
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

/**
 * Statut d'un appel TMDB — granulaire pour des messages utilisateur
 * compréhensibles (code HTTP + explication). Une erreur ne bloque JAMAIS
 * l'app : la fiche reste toujours qualifiable manuellement.
 */
export type TmdbCallStatus =
  | 'ok'
  | 'noKey' /*        aucune clé configurée (pas un appel réseau) */
  | 'invalidKey' /*   HTTP 401 : clé refusée */
  | 'notFound' /*     HTTP 404 : film introuvable (fiche supprimée ?) */
  | 'rateLimited' /*  HTTP 429 : trop de requêtes */
  | 'serverError' /*  HTTP 5xx : TMDB en difficulté */
  | 'timeout' /*      délai dépassé */
  | 'network' /*      pas de connexion (hors ligne, DNS…) */
  | 'error'; /*       inattendu (code HTTP inhabituel, JSON illisible…) */

/** Langues de MÉTADONNÉES proposées (fiches TMDB) — libellés natifs. */
export const TMDB_METADATA_LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'fr-FR', label: 'Français' },
  { value: 'en-US', label: 'English' },
  { value: 'de-DE', label: 'Deutsch' },
  { value: 'es-ES', label: 'Español' },
  { value: 'it-IT', label: 'Italiano' },
  { value: 'pt-BR', label: 'Português (BR)' },
  { value: 'nl-NL', label: 'Nederlands' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'zh-CN', label: '中文' },
  { value: 'ru-RU', label: 'Русский' },
];

/** Langues de TRAILER proposées (codes iso_639_1 des vidéos TMDB).
 *  La valeur spéciale `original` = langue originale du film (défaut). */
export const TMDB_TRAILER_LANGUAGES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'original', label: 'VO' },
  { value: 'fr', label: 'Français' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'it', label: 'Italiano' },
  { value: 'pt', label: 'Português' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'zh', label: '中文' },
  { value: 'ru', label: 'Русский' },
];

/** Préférences de langues TMDB (réglées sur l'accueil, section clé API). */
export interface TmdbLanguageConfig {
  /** Langue des fiches (ex. `fr-FR`) — fallback VO/anglais si absent. */
  metadataLanguage: string;
  /** Langue préférée du trailer (`original` = VO du film, défaut). */
  trailerLanguage: string;
}

/** Un résultat de recherche TMDB (liste de choix de l'assistant). */
export interface TmdbSearchResult {
  tmdbId: number;
  /** Titre localisé (fr-FR). */
  title: string;
  /** Titre original (VO). */
  originalTitle: string;
  year: number | null;
  overview: string | null;
  /** URL de la vignette d'affiche (image.tmdb.org, en ligne uniquement). */
  posterUrl: string | null;
}

/** Résultat d'une recherche TMDB (statut + liste, vide hors `ok`). */
export interface TmdbSearchOutcome {
  status: TmdbCallStatus;
  /** Code HTTP quand pertinent (affiché dans le message d'erreur). */
  httpStatus: number | null;
  results: TmdbSearchResult[];
}

/** Détails complets d'un film TMDB, mappés vers NOTRE schéma. */
export interface TmdbMovieDetails {
  tmdbId: number;
  titleVo: string;
  /** Titre fr si différent de la VO, sinon null. */
  titleVf: string | null;
  year: number | null;
  overview: string | null;
  genres: string[];
  directors: string[];
  writers: string[];
  /** Casting principal (ordre TMDB), avec personnages. */
  actors: QualifyActor[];
  trailerYoutubeKey: string | null;
  /** Note moyenne TMDB (0-10, une décimale) — distincte de la note perso. */
  tmdbRating: number | null;
  /** Chemins d'images TMDB (téléchargées en sidecars à l'étape 2.5). */
  tmdbPosterPath: string | null;
  tmdbBackdropPath: string | null;
}

/** Détails TMDB (statut + fiche, null hors `ok`). */
export interface TmdbDetailsOutcome {
  status: TmdbCallStatus;
  /** Code HTTP quand pertinent (affiché dans le message d'erreur). */
  httpStatus: number | null;
  details: TmdbMovieDetails | null;
}

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
  /** Affiche sidecar (chemin relatif au lecteur), servie via m0v13s-img. */
  posterPath: string | null;
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
  personalNotes: string | null;
  tmdbRating: number | null;
  /** Images sidecar (chemins relatifs), servies via le protocole m0v13s-img. */
  posterPath: string | null;
  backdropPath: string | null;
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
