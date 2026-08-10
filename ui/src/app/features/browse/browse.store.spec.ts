import { TestBed } from '@angular/core/testing';
import type { MovieListItem } from '@shared/dto';

import { ApiService } from '../../core/services/api.service';
import { LibraryStore } from '../../core/library.store';
import { BrowseStore, displayTitle } from './browse.store';

/**
 * Tests du store du browse (règle CLAUDE.md : stores signaux testés) :
 * dérivation des rangées (récents, genres) depuis la liste des films.
 */

/** Fabrique un film de test complet ; seuls les champs utiles varient. */
function makeMovie(partial: Partial<MovieListItem> & { id: number }): MovieListItem {
  return {
    titleVo: `Film ${partial.id}`,
    titleVf: null,
    year: null,
    durationSec: null,
    posterPath: null,
    backdropPath: null,
    personalRating: null,
    tmdbRating: null,
    genres: [],
    tags: [],
    directors: [],
    actors: [],
    addedAt: partial.id,
    seen: false,
    watchCount: 0,
    resumePositionSec: null,
    lastWatchedAt: null,
    ...partial,
  };
}

/** Double d'ApiService : seul listMovies est consommé ici. */
class FakeApiService {
  moviesResult: MovieListItem[] = [];
  async listMovies(): Promise<MovieListItem[]> {
    return this.moviesResult;
  }
}

describe('BrowseStore — rangées', () => {
  let fake: FakeApiService;
  let library: LibraryStore;
  let browse: BrowseStore;

  beforeEach(() => {
    fake = new FakeApiService();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: fake }],
    });
    library = TestBed.inject(LibraryStore);
    browse = TestBed.inject(BrowseStore);
  });

  it('displayTitle privilégie le titre localisé, sinon la VO', () => {
    expect(displayTitle(makeMovie({ id: 1, titleVo: 'Alien' }))).toBe('Alien');
    expect(
      displayTitle(makeMovie({ id: 1, titleVo: 'Alien', titleVf: 'Alien, le 8e passager' })),
    ).toBe('Alien, le 8e passager');
  });

  it('allMovies trie par titre d affichage, accents et casse ignorés', async () => {
    fake.moviesResult = [
      makeMovie({ id: 1, titleVo: 'Zodiac' }),
      makeMovie({ id: 2, titleVo: 'État de siège' }),
      makeMovie({ id: 3, titleVo: 'alien' }),
      // Le titre localisé prime aussi pour le TRI.
      makeMovie({ id: 4, titleVo: 'The Thing', titleVf: 'Effroyable chose' }),
    ];
    await library.loadMovies();
    expect(browse.allMovies().map((m) => m.id)).toEqual([3, 4, 2, 1]);
  });

  it('recentlyAdded classe par date d ajout décroissante', async () => {
    fake.moviesResult = [
      makeMovie({ id: 1, addedAt: 100 }),
      makeMovie({ id: 2, addedAt: 300 }),
      makeMovie({ id: 3, addedAt: 200 }),
    ];
    await library.loadMovies();
    expect(browse.recentlyAdded().map((m) => m.id)).toEqual([2, 3, 1]);
  });

  it('genreRows regroupe, ignore les genres à un seul film, classe par taille', async () => {
    fake.moviesResult = [
      makeMovie({ id: 1, genres: ['SF', 'Horreur'] }),
      makeMovie({ id: 2, genres: ['SF'] }),
      makeMovie({ id: 3, genres: ['SF', 'Drame'] }),
      makeMovie({ id: 4, genres: ['Horreur'] }),
      // « Drame » n'a qu'un film → pas de rangée.
    ];
    await library.loadMovies();
    const rows = browse.genreRows();
    expect(rows.map((r) => r.genre)).toEqual(['SF', 'Horreur']);
    expect(rows[0]?.movies.map((m) => m.id)).toEqual([1, 2, 3]); // tri par titre
  });

  it('les rangées réagissent au rechargement de la liste (signaux)', async () => {
    fake.moviesResult = [makeMovie({ id: 1 })];
    await library.loadMovies();
    expect(browse.allMovies()).toHaveLength(1);

    fake.moviesResult = [makeMovie({ id: 1 }), makeMovie({ id: 2 })];
    await library.loadMovies();
    expect(browse.allMovies()).toHaveLength(2);
  });
});

describe('BrowseStore — filtres et tris combinables (TODO 3.4)', () => {
  let fake: FakeApiService;
  let library: LibraryStore;
  let browse: BrowseStore;

  beforeEach(async () => {
    fake = new FakeApiService();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: fake }],
    });
    library = TestBed.inject(LibraryStore);
    browse = TestBed.inject(BrowseStore);
    fake.moviesResult = [
      makeMovie({
        id: 1,
        titleVo: 'Alien',
        year: 1979,
        durationSec: 117 * 60,
        genres: ['SF', 'Horreur'],
        tags: ['huis clos'],
        directors: ['Ridley Scott'],
        actors: ['Sigourney Weaver'],
        seen: true,
        addedAt: 10,
      }),
      makeMovie({
        id: 2,
        titleVo: 'Léon',
        titleVf: 'Léon',
        year: 1994,
        durationSec: 110 * 60,
        genres: ['Thriller'],
        directors: ['Luc Besson'],
        actors: ['Jean Reno', 'Natalie Portman'],
        addedAt: 30,
      }),
      makeMovie({
        id: 3,
        titleVo: 'Novecento',
        year: null,
        durationSec: 317 * 60,
        genres: ['Drame'],
        directors: ['Bernardo Bertolucci'],
        addedAt: 20,
      }),
      makeMovie({ id: 4, titleVo: 'Sans durée', year: 2001, durationSec: null, addedAt: 40 }),
    ];
    await library.loadMovies();
    browse.resetFilters();
  });

  it('sans critère, filtering est faux et filtered rend tout', () => {
    expect(browse.filtering()).toBe(false);
    expect(browse.filtered()).toHaveLength(4);
  });

  it('recherche : accents et casse ignorés, VO et titre localisé confondus', () => {
    browse.search.set('leon');
    expect(browse.filtered().map((m) => m.id)).toEqual([2]);
    expect(browse.filtering()).toBe(true);
  });

  it('les critères se combinent en ET (genre + acteur)', () => {
    browse.genre.set('SF');
    expect(browse.filtered().map((m) => m.id)).toEqual([1]);

    browse.actor.set('Jean Reno'); // SF ET Jean Reno → aucun
    expect(browse.filtered()).toHaveLength(0);
  });

  it('filtres réalisateur, tag, année', () => {
    browse.director.set('Bernardo Bertolucci');
    expect(browse.filtered().map((m) => m.id)).toEqual([3]);
    browse.resetFilters();

    browse.tag.set('huis clos');
    expect(browse.filtered().map((m) => m.id)).toEqual([1]);
    browse.resetFilters();

    browse.year.set(1994);
    expect(browse.filtered().map((m) => m.id)).toEqual([2]);
  });

  it('durée : tranches en minutes, durée inconnue exclue des tranches', () => {
    browse.duration.set('b90to120');
    expect(browse.filtered().map((m) => m.id)).toEqual([1, 2]);

    browse.duration.set('gt150');
    expect(browse.filtered().map((m) => m.id)).toEqual([3]);

    browse.duration.set('lt90'); // « Sans durée » (null) ne matche jamais
    expect(browse.filtered()).toHaveLength(0);
  });

  it('vu / pas vu', () => {
    browse.seen.set('seen');
    expect(browse.filtered().map((m) => m.id)).toEqual([1]);

    browse.seen.set('unseen');
    expect(browse.filtered().map((m) => m.id)).toEqual([2, 3, 4]);
  });

  it('tri par année : inconnues en dernier dans les deux sens', () => {
    browse.sortKey.set('year');
    expect(browse.filtered().map((m) => m.id)).toEqual([1, 2, 4, 3]);

    browse.sortDesc.set(true);
    expect(browse.filtered().map((m) => m.id)).toEqual([4, 2, 1, 3]);
  });

  it('tri par date d ajout, sens inversable', () => {
    browse.sortKey.set('added');
    expect(browse.filtered().map((m) => m.id)).toEqual([1, 3, 2, 4]);

    browse.sortDesc.set(true);
    expect(browse.filtered().map((m) => m.id)).toEqual([4, 2, 3, 1]);
  });

  it('resetFilters remet tous les critères et le tri au défaut', () => {
    browse.search.set('alien');
    browse.genre.set('SF');
    browse.sortDesc.set(true);
    browse.resetFilters();
    expect(browse.filtering()).toBe(false);
    expect(browse.filtered()).toHaveLength(4);
  });

  it('les listes d options viennent de la bibliothèque, triées', () => {
    expect(browse.allGenres()).toEqual(['Drame', 'Horreur', 'SF', 'Thriller']);
    expect(browse.allDirectors()).toEqual([
      'Bernardo Bertolucci',
      'Luc Besson',
      'Ridley Scott',
    ]);
    expect(browse.allYears()).toEqual([2001, 1994, 1979]);
  });
});

describe('BrowseStore — rangées de suggestions (TODO 5.1)', () => {
  let fake: FakeApiService;
  let library: LibraryStore;
  let browse: BrowseStore;

  /** Il y a ~1 an et ~1 mois (bornes de « pas revus depuis longtemps »). */
  const ONE_YEAR_AGO = Date.now() - 365 * 24 * 3600 * 1000;
  const ONE_MONTH_AGO = Date.now() - 30 * 24 * 3600 * 1000;

  beforeEach(() => {
    fake = new FakeApiService();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: fake }],
    });
    library = TestBed.inject(LibraryStore);
    browse = TestBed.inject(BrowseStore);
  });

  it('sans aucun historique : seules Reprendre/… restent vides', async () => {
    fake.moviesResult = [makeMovie({ id: 1 }), makeMovie({ id: 2 })];
    await library.loadMovies();
    expect(browse.resumeRow()).toEqual([]);
    expect(browse.neverSeenRow()).toEqual([]); // sinon = toute la bibliothèque
    expect(browse.favoriteGenre()).toBeNull();
    expect(browse.favoriteGenreRow()).toEqual([]);
    expect(browse.longUnseenRow()).toEqual([]);
  });

  it('« Reprendre » : films entamés, dernière activité d abord', async () => {
    fake.moviesResult = [
      makeMovie({ id: 1, resumePositionSec: 600, lastWatchedAt: 100 }),
      makeMovie({ id: 2, resumePositionSec: 1200, lastWatchedAt: 300 }),
      makeMovie({ id: 3 }),
    ];
    await library.loadMovies();
    expect(browse.resumeRow().map((m) => m.id)).toEqual([2, 1]);
  });

  it('« Jamais vus » : ni terminés ni entamés, dès qu un historique existe', async () => {
    fake.moviesResult = [
      makeMovie({ id: 1, seen: true, lastWatchedAt: ONE_MONTH_AGO }),
      makeMovie({ id: 2, resumePositionSec: 600 }),
      makeMovie({ id: 3 }),
    ];
    await library.loadMovies();
    expect(browse.neverSeenRow().map((m) => m.id)).toEqual([3]);
  });

  it('genre favori : pondéré par les visionnages, films PAS VUS proposés', async () => {
    fake.moviesResult = [
      makeMovie({ id: 1, seen: true, watchCount: 3, genres: ['SF'] }),
      makeMovie({ id: 2, seen: true, watchCount: 1, genres: ['Drame'] }),
      makeMovie({ id: 3, genres: ['SF'] }), // pas vu → proposé
      makeMovie({ id: 4, genres: ['Drame'] }),
    ];
    await library.loadMovies();
    expect(browse.favoriteGenre()).toBe('SF');
    expect(browse.favoriteGenreRow().map((m) => m.id)).toEqual([3]);
  });

  it('« Pas revus depuis longtemps » : > ~6 mois, les plus anciens d abord', async () => {
    fake.moviesResult = [
      makeMovie({ id: 1, seen: true, lastWatchedAt: ONE_MONTH_AGO }), // trop récent
      makeMovie({ id: 2, seen: true, lastWatchedAt: ONE_YEAR_AGO }),
      makeMovie({ id: 3, seen: true, lastWatchedAt: ONE_YEAR_AGO - 1000 }), // plus ancien
    ];
    await library.loadMovies();
    expect(browse.longUnseenRow().map((m) => m.id)).toEqual([3, 2]);
  });
});
