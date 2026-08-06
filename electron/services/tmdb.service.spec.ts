/**
 * Tests du service TMDB (partie clé API) — fetch MOCKÉ, aucun réseau.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppDatabaseHandle, openDatabase } from '../db/client';
import { SettingsService } from './settings.service';
import { TmdbService, maskApiKey, parseTmdbDetails, parseTmdbSearch } from './tmdb.service';

const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');

let tmpDir: string;
let handle: AppDatabaseHandle;
let settings: SettingsService;

/** Fabrique un double de fetch qui répond avec le statut HTTP donné. */
function fetchRespondingWith(status: number): typeof fetch {
  return async () => new Response('{}', { status });
}

/** Double de fetch qui simule une panne réseau (hors ligne). */
const fetchOffline: typeof fetch = async () => {
  throw new TypeError('fetch failed');
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm0v13s-tmdb-test-'));
  handle = openDatabase(path.join(tmpDir, 'library.db'), MIGRATIONS_DIR);
  settings = new SettingsService(handle.db);
});

afterEach(() => {
  handle.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('maskApiKey', () => {
  it('ne révèle que les 4 derniers caractères', () => {
    expect(maskApiKey('abcdef1234567890')).toBe('****7890');
  });

  it('voile entièrement une clé trop courte', () => {
    expect(maskApiKey('abc')).toBe('****');
  });
});

describe('TmdbService — statut et stockage de la clé', () => {
  it('statut « non configurée » sans clé, puis masqué après enregistrement', () => {
    const service = new TmdbService(settings, fetchOffline);
    expect(service.getKeyStatus()).toEqual({ configured: false, maskedKey: null });

    service.setKey('  abcdef1234567890  '); // espaces parasites tolérés
    expect(service.getKeyStatus()).toEqual({ configured: true, maskedKey: '****7890' });
  });

  it('une clé vide efface la configuration', () => {
    const service = new TmdbService(settings, fetchOffline);
    service.setKey('abcdef1234567890');
    service.setKey('');
    expect(service.getKeyStatus()).toEqual({ configured: false, maskedKey: null });
  });
});

describe('TmdbService.testKey', () => {
  it('valid quand TMDB répond 200', async () => {
    const service = new TmdbService(settings, fetchRespondingWith(200));
    service.setKey('bonne-cle');
    expect(await service.testKey()).toBe('valid');
  });

  it('invalid quand TMDB répond 401', async () => {
    const service = new TmdbService(settings, fetchRespondingWith(401));
    service.setKey('mauvaise-cle');
    expect(await service.testKey()).toBe('invalid');
  });

  it('invalid sans clé stockée ni candidate (rien à tester)', async () => {
    const service = new TmdbService(settings, fetchRespondingWith(200));
    expect(await service.testKey()).toBe('invalid');
  });

  it('offline quand le réseau est indisponible (clé conservée)', async () => {
    const service = new TmdbService(settings, fetchOffline);
    service.setKey('cle-saisie-hors-ligne');
    expect(await service.testKey()).toBe('offline');
    expect(service.getKeyStatus().configured).toBe(true);
  });

  it('teste une clé CANDIDATE sans toucher à la clé stockée', async () => {
    const service = new TmdbService(settings, fetchRespondingWith(200));
    service.setKey('cle-stockee');
    expect(await service.testKey('candidate')).toBe('valid');
    expect(service.getKeyStatus().maskedKey).toBe('****ckee');
  });
});

/* ------------------------------------------------------------------ */
/* Mapping des réponses TMDB (fonctions pures, fixtures réalistes)     */
/* ------------------------------------------------------------------ */

/** Extrait réaliste d'une réponse /search/movie (fr-FR). */
const SEARCH_JSON = {
  results: [
    {
      id: 348,
      title: 'Alien, le huitième passager',
      original_title: 'Alien',
      release_date: '1979-05-25',
      overview: 'Le vaisseau commercial Nostromo…',
      poster_path: '/abc.jpg',
    },
    { id: 8078, title: 'Alien, la résurrection', original_title: 'Alien: Resurrection', release_date: '1997-11-12', overview: '', poster_path: null },
    { title: 'Entrée cassée sans id', release_date: '2000-01-01' },
  ],
};

/** Extrait réaliste d'une réponse /movie/{id}?append_to_response=credits,videos. */
const DETAILS_JSON = {
  id: 348,
  title: 'Alien, le huitième passager',
  original_title: 'Alien',
  release_date: '1979-05-25',
  overview: 'Le vaisseau commercial Nostromo…',
  poster_path: '/abc.jpg',
  backdrop_path: '/fond.jpg',
  genres: [{ name: 'Horreur' }, { name: 'Science-Fiction' }],
  credits: {
    cast: [
      { name: 'Tom Skerritt', character: 'Dallas', order: 1 },
      { name: 'Sigourney Weaver', character: 'Ripley', order: 0 },
    ],
    crew: [
      { name: 'Ridley Scott', job: 'Director', department: 'Directing' },
      { name: 'Dan O’Bannon', job: 'Screenplay', department: 'Writing' },
      { name: 'Dan O’Bannon', job: 'Story', department: 'Writing' },
      { name: 'Derek Vanlint', job: 'Director of Photography', department: 'Camera' },
    ],
  },
  videos: {
    results: [
      { site: 'YouTube', type: 'Teaser', key: 'teaser1', iso_639_1: 'en' },
      { site: 'YouTube', type: 'Trailer', key: 'trailerEN', iso_639_1: 'en' },
      { site: 'YouTube', type: 'Trailer', key: 'trailerFR', iso_639_1: 'fr' },
    ],
  },
};

describe('parseTmdbSearch', () => {
  it('mappe les résultats et ignore les entrées invalides', () => {
    const results = parseTmdbSearch(SEARCH_JSON);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      tmdbId: 348,
      title: 'Alien, le huitième passager',
      originalTitle: 'Alien',
      year: 1979,
      overview: 'Le vaisseau commercial Nostromo…',
      posterUrl: 'https://image.tmdb.org/t/p/w185/abc.jpg',
    });
    // Overview vide -> null, pas d'affiche -> null.
    expect(results[1]!.overview).toBeNull();
    expect(results[1]!.posterUrl).toBeNull();
  });
});

describe('parseTmdbDetails', () => {
  it('mappe la fiche complète vers notre schéma', () => {
    const details = parseTmdbDetails(DETAILS_JSON);
    expect(details).toEqual({
      tmdbId: 348,
      titleVo: 'Alien',
      titleVf: 'Alien, le huitième passager',
      year: 1979,
      overview: 'Le vaisseau commercial Nostromo…',
      genres: ['Horreur', 'Science-Fiction'],
      directors: ['Ridley Scott'],
      writers: ['Dan O’Bannon'], // dédoublonné (Screenplay + Story)
      actors: [
        { name: 'Sigourney Weaver', character: 'Ripley' }, // ordre TMDB
        { name: 'Tom Skerritt', character: 'Dallas' },
      ],
      trailerYoutubeKey: 'trailerFR', // trailer YouTube FR prioritaire
      tmdbPosterPath: '/abc.jpg',
      tmdbBackdropPath: '/fond.jpg',
    });
  });

  it('titre VF null quand identique à la VO ; null sans id/titre', () => {
    expect(
      parseTmdbDetails({ id: 1, title: 'Prometheus', original_title: 'Prometheus' })?.titleVf,
    ).toBeNull();
    expect(parseTmdbDetails({ title: 'Sans id' })).toBeNull();
  });
});

describe('TmdbService.searchMovies / getMovieDetails — statuts', () => {
  /** fetch qui répond 200 avec un corps JSON donné. */
  function fetchJson(body: unknown): typeof fetch {
    return async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
  }

  it('noKey sans clé configurée (aucun appel réseau)', async () => {
    const service = new TmdbService(settings, fetchOffline);
    expect((await service.searchMovies('Alien')).status).toBe('noKey');
    expect((await service.getMovieDetails(348)).status).toBe('noKey');
  });

  it('ok avec résultats mappés quand TMDB répond', async () => {
    const service = new TmdbService(settings, fetchJson(SEARCH_JSON));
    service.setKey('bonne-cle');
    const outcome = await service.searchMovies('Alien', 1979);
    expect(outcome.status).toBe('ok');
    expect(outcome.results[0]!.tmdbId).toBe(348);
  });

  it('invalidKey sur 401, unavailable sur panne réseau', async () => {
    const bad = new TmdbService(settings, fetchRespondingWith(401));
    bad.setKey('mauvaise');
    expect((await bad.searchMovies('Alien')).status).toBe('invalidKey');

    const off = new TmdbService(settings, fetchOffline);
    off.setKey('cle');
    expect((await off.getMovieDetails(348)).status).toBe('unavailable');
  });
});
