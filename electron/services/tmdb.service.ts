/**
 * TMDB — enrichissement des fiches (PLAN § 6.2), gestion de la clé API et
 * des préférences de langues.
 *
 * Clé API : personnelle à chaque utilisateur (open source), saisie dans
 * l'app (écran d'accueil), stockée dans `settings` (côté data\ — jamais
 * commitée), jamais renvoyée en clair au renderer (statut masqué).
 *
 * Langues (décision utilisateur, retour de validation phase 2) :
 * - métadonnées : langue CHOISIE par l'utilisateur (dropdown accueil),
 *   avec repli sur la version originale/anglais si la traduction manque ;
 * - trailer : VO du film par défaut, langue préférée configurable
 *   (repli VO si indisponible).
 *
 * Erreurs : JAMAIS d'exception vers l'UI — chaque appel retourne un
 * statut granulaire (+ code HTTP) que l'UI traduit en message clair.
 */
import type {
  QualifyActor,
  TmdbCallStatus,
  TmdbDetailsOutcome,
  TmdbKeyStatus,
  TmdbKeyTestResult,
  TmdbLanguageConfig,
  TmdbMovieDetails,
  TmdbSearchOutcome,
  TmdbSearchResult,
} from '@shared/dto';
import type { SettingsService } from './settings.service';

/** Base de l'API v3 de TMDB (seul hôte réseau autorisé pour ce service). */
const TMDB_API_BASE = 'https://api.themoviedb.org/3';

/** Base des images TMDB (vignettes de la liste de choix — en ligne). */
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/** Langue de REPLI des métadonnées : l'anglais/VO (décision utilisateur). */
const FALLBACK_LANGUAGE = 'en-US';

/** Délai maximal d'un appel de test (l'app est offline-first : on tranche vite). */
const TEST_TIMEOUT_MS = 8_000;

/** Délai maximal des appels de recherche/détails. */
const CALL_TIMEOUT_MS = 12_000;

/** Nombre maximal de résultats de recherche présentés à l'utilisateur. */
const MAX_SEARCH_RESULTS = 8;

/** Nombre d'acteurs retenus du casting (ordre TMDB = importance). */
const MAX_ACTORS = 10;

/**
 * Masque une clé pour affichage : uniquement les 4 derniers caractères.
 * (Une clé trop courte pour être masquée utilement est entièrement voilée.)
 */
export function maskApiKey(key: string): string {
  if (key.length <= 4) {
    return '****';
  }
  return `****${key.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/* Mapping des réponses TMDB (fonctions PURES, testées sur fixtures)   */
/* ------------------------------------------------------------------ */

/** Année depuis une date TMDB (`YYYY-MM-DD`), null si absente/illisible. */
function yearOf(releaseDate: unknown): number | null {
  if (typeof releaseDate !== 'string' || releaseDate.length < 4) {
    return null;
  }
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

/** Chaîne non vide, sinon null (TMDB renvoie souvent des champs ''). */
function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Forme minimale de la réponse /search/movie qu'on exploite. */
interface TmdbSearchJson {
  results?: Array<{
    id?: number;
    title?: string;
    original_title?: string;
    release_date?: string;
    overview?: string;
    poster_path?: string | null;
  }>;
}

/**
 * Transforme la réponse brute de /search/movie en liste de choix.
 * Les entrées sans id ou sans titre sont ignorées.
 */
export function parseTmdbSearch(json: TmdbSearchJson): TmdbSearchResult[] {
  return (json.results ?? [])
    .filter((r) => typeof r.id === 'number' && nonEmpty(r.title ?? r.original_title) !== null)
    .slice(0, MAX_SEARCH_RESULTS)
    .map((r) => {
      const title = nonEmpty(r.title) ?? nonEmpty(r.original_title) ?? '';
      return {
        tmdbId: r.id as number,
        title,
        originalTitle: nonEmpty(r.original_title) ?? title,
        year: yearOf(r.release_date),
        overview: nonEmpty(r.overview),
        posterUrl: r.poster_path ? `${TMDB_IMAGE_BASE}/w185${r.poster_path}` : null,
      };
    });
}

/** Un trailer YouTube candidat (extrait de videos.results). */
interface TrailerCandidate {
  key: string;
  language: string | null;
}

/**
 * Choisit le trailer selon la préférence utilisateur (PURE) :
 * - `original` (défaut) → trailer dans la langue ORIGINALE du film ;
 * - langue précise → cette langue si disponible, sinon repli VO ;
 * - dernier repli : le premier trailer YouTube disponible.
 */
export function pickTrailer(
  trailers: TrailerCandidate[],
  originalLanguage: string | null,
  preference: string,
): string | null {
  if (trailers.length === 0) {
    return null;
  }
  const inOriginal = trailers.find((t) => t.language === originalLanguage) ?? null;
  if (preference !== 'original') {
    const preferred = trailers.find((t) => t.language === preference);
    if (preferred !== undefined) {
      return preferred.key;
    }
  }
  return (inOriginal ?? trailers[0]!).key;
}

/** Forme minimale de la réponse /movie/{id} (+credits,videos) exploitée. */
interface TmdbDetailsJson {
  id?: number;
  title?: string;
  original_title?: string;
  original_language?: string;
  release_date?: string;
  overview?: string;
  vote_average?: number;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genres?: Array<{ name?: string }>;
  credits?: {
    cast?: Array<{ name?: string; character?: string; order?: number }>;
    crew?: Array<{ name?: string; job?: string; department?: string }>;
  };
  videos?: {
    results?: Array<{ site?: string; type?: string; key?: string; iso_639_1?: string }>;
  };
}

/**
 * Transforme la réponse brute de /movie/{id} en fiche mappée vers NOTRE
 * schéma :
 * - VO = original_title ; titre localisé = title s'il diffère de la VO ;
 * - réalisateurs = crew job « Director » ; scénaristes = département
 *   « Writing » (Screenplay, Writer, Story…) sans doublon ;
 * - casting principal limité, avec personnages, dans l'ordre TMDB ;
 * - note TMDB (vote_average) arrondie à une décimale ;
 * - trailer YouTube choisi selon la préférence (voir pickTrailer).
 */
export function parseTmdbDetails(
  json: TmdbDetailsJson,
  trailerPreference = 'original',
): TmdbMovieDetails | null {
  const titleVo = nonEmpty(json.original_title) ?? nonEmpty(json.title);
  if (typeof json.id !== 'number' || titleVo === null) {
    return null;
  }
  const localizedTitle = nonEmpty(json.title);

  const crew = json.credits?.crew ?? [];
  const directors = crew
    .filter((c) => c.job === 'Director' && nonEmpty(c.name) !== null)
    .map((c) => c.name as string);
  const writers = [
    ...new Set(
      crew
        .filter((c) => c.department === 'Writing' && nonEmpty(c.name) !== null)
        .map((c) => c.name as string),
    ),
  ];

  const actors: QualifyActor[] = (json.credits?.cast ?? [])
    .filter((c) => nonEmpty(c.name) !== null)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .slice(0, MAX_ACTORS)
    .map((c) => ({ name: c.name as string, character: nonEmpty(c.character) }));

  const trailers: TrailerCandidate[] = (json.videos?.results ?? [])
    .filter((v) => v.site === 'YouTube' && v.type === 'Trailer' && nonEmpty(v.key) !== null)
    .map((v) => ({ key: v.key as string, language: nonEmpty(v.iso_639_1) }));

  return {
    tmdbId: json.id,
    titleVo,
    titleVf: localizedTitle !== null && localizedTitle !== titleVo ? localizedTitle : null,
    year: yearOf(json.release_date),
    overview: nonEmpty(json.overview),
    genres: (json.genres ?? [])
      .map((g) => nonEmpty(g.name))
      .filter((n): n is string => n !== null),
    directors,
    writers,
    actors,
    trailerYoutubeKey: pickTrailer(
      trailers,
      nonEmpty(json.original_language),
      trailerPreference,
    ),
    tmdbRating:
      typeof json.vote_average === 'number' && json.vote_average > 0
        ? Math.round(json.vote_average * 10) / 10
        : null,
    tmdbPosterPath: nonEmpty(json.poster_path),
    tmdbBackdropPath: nonEmpty(json.backdrop_path),
  };
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/** Résultat interne d'un appel TMDB : JSON ou statut d'échec classifié. */
type TmdbCallResult<T> =
  | { ok: true; json: T }
  | { ok: false; status: Exclude<TmdbCallStatus, 'ok'>; httpStatus: number | null };

export class TmdbService {
  constructor(
    private readonly settings: SettingsService,
    /** fetch injectable — les tests fournissent un double, jamais de réseau. */
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  /* ----------------------- clé API ------------------------ */

  /** Clé stockée, ou null si absente/vide. */
  private storedKey(): string | null {
    const key = this.settings.get('tmdb.apiKey')?.trim() ?? '';
    return key === '' ? null : key;
  }

  /** Statut exposé au renderer (jamais la clé en clair). */
  getKeyStatus(): TmdbKeyStatus {
    const key = this.storedKey();
    return {
      configured: key !== null,
      maskedKey: key === null ? null : maskApiKey(key),
    };
  }

  /** Enregistre (ou efface, si vide) la clé API. */
  setKey(key: string): void {
    this.settings.set('tmdb.apiKey', key.trim());
  }

  /**
   * Teste une clé contre l'API TMDB (endpoint /configuration, léger).
   * @param candidateKey clé à tester ; par défaut la clé stockée
   * @returns 'valid' | 'invalid' (clé absente ou refusée) | 'offline'
   *          (réseau indisponible : impossible de trancher)
   */
  async testKey(candidateKey?: string): Promise<TmdbKeyTestResult> {
    const key =
      candidateKey?.trim() !== '' && candidateKey !== undefined
        ? candidateKey.trim()
        : this.storedKey();
    if (key === null) {
      return 'invalid';
    }

    try {
      const response = await this.fetchFn(
        `${TMDB_API_BASE}/configuration?api_key=${encodeURIComponent(key)}`,
        { signal: AbortSignal.timeout(TEST_TIMEOUT_MS) },
      );
      return response.ok ? 'valid' : 'invalid';
    } catch {
      // Échec réseau (hors ligne, DNS, timeout) : on ne peut pas conclure.
      return 'offline';
    }
  }

  /* ----------------------- langues ------------------------ */

  /** Préférences de langues (métadonnées + trailer), avec défauts sûrs. */
  getLanguageConfig(): TmdbLanguageConfig {
    // Défaut métadonnées : la langue de l'UI si connue, sinon l'anglais.
    const uiLang = this.settings.get('ui.lang');
    const defaultMetadata = uiLang === 'fr' ? 'fr-FR' : FALLBACK_LANGUAGE;
    return {
      metadataLanguage: this.settings.get('tmdb.language') ?? defaultMetadata,
      trailerLanguage: this.settings.get('tmdb.trailerLanguage') ?? 'original',
    };
  }

  /** Enregistre les préférences de langues (dropdowns de l'accueil). */
  setLanguageConfig(config: TmdbLanguageConfig): void {
    this.settings.set('tmdb.language', config.metadataLanguage);
    this.settings.set('tmdb.trailerLanguage', config.trailerLanguage);
  }

  /* ------------------- appels enrichissement --------------- */

  /**
   * Exécute un appel TMDB et CLASSIFIE tout échec (jamais d'exception) :
   * 401 clé refusée, 404 introuvable, 429 trop de requêtes, 5xx serveur,
   * timeout, panne réseau, JSON illisible.
   */
  private async callTmdb<T>(url: string): Promise<TmdbCallResult<T>> {
    let response: Response;
    try {
      response = await this.fetchFn(url, { signal: AbortSignal.timeout(CALL_TIMEOUT_MS) });
    } catch (error) {
      const isTimeout = error instanceof DOMException && error.name === 'TimeoutError';
      return { ok: false, status: isTimeout ? 'timeout' : 'network', httpStatus: null };
    }

    if (!response.ok) {
      const httpStatus = response.status;
      const status: Exclude<TmdbCallStatus, 'ok'> =
        httpStatus === 401
          ? 'invalidKey'
          : httpStatus === 404
            ? 'notFound'
            : httpStatus === 429
              ? 'rateLimited'
              : httpStatus >= 500
                ? 'serverError'
                : 'error';
      return { ok: false, status, httpStatus };
    }

    try {
      return { ok: true, json: (await response.json()) as T };
    } catch {
      return { ok: false, status: 'error', httpStatus: response.status };
    }
  }

  /**
   * Recherche de films (titre + année optionnelle) dans la langue de
   * métadonnées choisie par l'utilisateur.
   */
  async searchMovies(query: string, year?: number | null): Promise<TmdbSearchOutcome> {
    const key = this.storedKey();
    if (key === null) {
      return { status: 'noKey', httpStatus: null, results: [] };
    }
    const { metadataLanguage } = this.getLanguageConfig();
    const url =
      `${TMDB_API_BASE}/search/movie?api_key=${encodeURIComponent(key)}` +
      `&language=${metadataLanguage}&include_adult=false` +
      `&query=${encodeURIComponent(query.trim())}` +
      (year !== undefined && year !== null ? `&year=${year}` : '');

    const call = await this.callTmdb<TmdbSearchJson>(url);
    if (!call.ok) {
      return { status: call.status, httpStatus: call.httpStatus, results: [] };
    }
    return { status: 'ok', httpStatus: null, results: parseTmdbSearch(call.json) };
  }

  /**
   * Détails complets d'un film (crédits + trailers en un seul appel via
   * append_to_response), dans la langue choisie — avec REPLI VO/anglais
   * pour le synopsis si la traduction manque (décision utilisateur).
   */
  async getMovieDetails(tmdbId: number): Promise<TmdbDetailsOutcome> {
    const key = this.storedKey();
    if (key === null) {
      return { status: 'noKey', httpStatus: null, details: null };
    }
    const { metadataLanguage, trailerLanguage } = this.getLanguageConfig();
    const urlFor = (language: string): string =>
      `${TMDB_API_BASE}/movie/${tmdbId}?api_key=${encodeURIComponent(key)}` +
      `&language=${language}&append_to_response=credits,videos`;

    const call = await this.callTmdb<TmdbDetailsJson>(urlFor(metadataLanguage));
    if (!call.ok) {
      return { status: call.status, httpStatus: call.httpStatus, details: null };
    }
    const details = parseTmdbDetails(call.json, trailerLanguage);
    if (details === null) {
      return { status: 'error', httpStatus: null, details: null };
    }

    // Repli VO : synopsis absent dans la langue choisie → tentative en
    // anglais (échec silencieux : le synopsis reste alors vide).
    if (details.overview === null && metadataLanguage !== FALLBACK_LANGUAGE) {
      const fallback = await this.callTmdb<TmdbDetailsJson>(urlFor(FALLBACK_LANGUAGE));
      if (fallback.ok) {
        details.overview = nonEmpty(fallback.json.overview);
      }
    }

    return { status: 'ok', httpStatus: null, details };
  }
}
