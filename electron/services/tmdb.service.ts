/**
 * TMDB — enrichissement des fiches (PLAN § 6.2) et gestion de la clé API.
 *
 * La clé est PERSONNELLE à chaque utilisateur de l'app (open source) :
 * saisie dans l'app (écran d'accueil), stockée dans `settings`
 * (`tmdb.apiKey`, côté data\ — jamais commitée), jamais renvoyée en clair
 * au renderer (statut masqué uniquement).
 *
 * Cette étape (2.3a) couvre la clé + son test de validité ; la recherche
 * et le mapping des fiches arrivent en 2.3b.
 */
import type {
  QualifyActor,
  TmdbDetailsOutcome,
  TmdbKeyStatus,
  TmdbKeyTestResult,
  TmdbMovieDetails,
  TmdbSearchOutcome,
  TmdbSearchResult,
} from '@shared/dto';
import type { SettingsService } from './settings.service';

/** Base de l'API v3 de TMDB (seul hôte réseau autorisé pour ce service). */
const TMDB_API_BASE = 'https://api.themoviedb.org/3';

/** Base des images TMDB (vignettes de la liste de choix — en ligne). */
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/** Langue des métadonnées (décision PLAN : fr-FR ; la VO vient d'original_title). */
const TMDB_LANGUAGE = 'fr-FR';

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
 * Transforme la réponse brute de /search/movie en liste de choix (PURE,
 * testée sur fixtures). Les entrées sans id ou sans titre sont ignorées.
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

/** Forme minimale de la réponse /movie/{id} (+credits,videos) exploitée. */
interface TmdbDetailsJson {
  id?: number;
  title?: string;
  original_title?: string;
  release_date?: string;
  overview?: string;
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
 * schéma (PURE, testée sur fixtures) :
 * - VO = original_title ; VF = title s'il diffère de la VO ;
 * - réalisateurs = crew job « Director » ; scénaristes = département
 *   « Writing » (Screenplay, Writer, Story…) sans doublon ;
 * - casting principal limité, avec personnages, dans l'ordre TMDB ;
 * - trailer YouTube : type « Trailer », français de préférence.
 */
export function parseTmdbDetails(json: TmdbDetailsJson): TmdbMovieDetails | null {
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

  const youtubeTrailers = (json.videos?.results ?? []).filter(
    (v) => v.site === 'YouTube' && v.type === 'Trailer' && nonEmpty(v.key) !== null,
  );
  const trailer =
    youtubeTrailers.find((v) => v.iso_639_1 === 'fr') ?? youtubeTrailers[0] ?? null;

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
    trailerYoutubeKey: trailer === null ? null : (trailer.key as string),
    tmdbPosterPath: nonEmpty(json.poster_path),
    tmdbBackdropPath: nonEmpty(json.backdrop_path),
  };
}

export class TmdbService {
  constructor(
    private readonly settings: SettingsService,
    /** fetch injectable — les tests fournissent un double, jamais de réseau. */
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

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
   *          (réseau indisponible : impossible de trancher — la clé
   *          saisie hors ligne sera testable plus tard)
   */
  async testKey(candidateKey?: string): Promise<TmdbKeyTestResult> {
    const key = candidateKey?.trim() !== '' && candidateKey !== undefined
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

  /**
   * Recherche de films (titre + année optionnelle, fr-FR).
   * Ne lève jamais : le statut dit à l'UI quoi afficher
   * (noKey / invalidKey / unavailable / ok).
   */
  async searchMovies(query: string, year?: number | null): Promise<TmdbSearchOutcome> {
    const key = this.storedKey();
    if (key === null) {
      return { status: 'noKey', results: [] };
    }
    const url =
      `${TMDB_API_BASE}/search/movie?api_key=${encodeURIComponent(key)}` +
      `&language=${TMDB_LANGUAGE}&include_adult=false` +
      `&query=${encodeURIComponent(query.trim())}` +
      (year !== undefined && year !== null ? `&year=${year}` : '');

    try {
      const response = await this.fetchFn(url, {
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      if (response.status === 401) {
        return { status: 'invalidKey', results: [] };
      }
      if (!response.ok) {
        return { status: 'unavailable', results: [] };
      }
      const json = (await response.json()) as TmdbSearchJson;
      return { status: 'ok', results: parseTmdbSearch(json) };
    } catch {
      return { status: 'unavailable', results: [] };
    }
  }

  /**
   * Détails complets d'un film (crédits + trailers en un seul appel via
   * append_to_response), mappés vers notre schéma.
   */
  async getMovieDetails(tmdbId: number): Promise<TmdbDetailsOutcome> {
    const key = this.storedKey();
    if (key === null) {
      return { status: 'noKey', details: null };
    }
    const url =
      `${TMDB_API_BASE}/movie/${tmdbId}?api_key=${encodeURIComponent(key)}` +
      `&language=${TMDB_LANGUAGE}&append_to_response=credits,videos`;

    try {
      const response = await this.fetchFn(url, {
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      if (response.status === 401) {
        return { status: 'invalidKey', details: null };
      }
      if (!response.ok) {
        return { status: 'unavailable', details: null };
      }
      const json = (await response.json()) as TmdbDetailsJson;
      const details = parseTmdbDetails(json);
      return details === null
        ? { status: 'unavailable', details: null }
        : { status: 'ok', details };
    } catch {
      return { status: 'unavailable', details: null };
    }
  }
}
