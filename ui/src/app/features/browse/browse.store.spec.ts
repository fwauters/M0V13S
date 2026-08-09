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
