import { TestBed } from '@angular/core/testing';
import type { ConformitySummary, MovieListItem } from '@shared/dto';

import { ApiService } from './services/api.service';
import { LibraryStore } from './library.store';

/**
 * Tests du store de bibliothèque (règle CLAUDE.md : stores signaux testés).
 * L'ApiService est doublé à la main : on vérifie la mémoïsation du contrôle
 * de conformité et l'alimentation des signaux.
 */
class FakeApiService {
  conformityCalls = 0;
  summary: ConformitySummary = {
    recognizedCount: 2,
    missingCount: 1,
    toQualifyCount: 3,
    forcedScan: false,
  };
  moviesResult: MovieListItem[] = [
    { id: 1, titleVo: 'Alien', titleVf: null, year: 1979, durationSec: 6960, genres: ['SF'] },
  ];

  async checkConformity(): Promise<ConformitySummary> {
    this.conformityCalls += 1;
    return this.summary;
  }

  async listMovies(): Promise<MovieListItem[]> {
    return this.moviesResult;
  }
}

describe('LibraryStore', () => {
  let fake: FakeApiService;
  let store: LibraryStore;

  beforeEach(() => {
    fake = new FakeApiService();
    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useValue: fake }],
    });
    store = TestBed.inject(LibraryStore);
  });

  it('mémoïse le contrôle de conformité (une exécution par lancement)', async () => {
    await store.ensureConformity();
    await store.ensureConformity();
    expect(fake.conformityCalls).toBe(1);
    expect(store.conformity()?.toQualifyCount).toBe(3);
    expect(store.forcedScan()).toBe(false);
  });

  it('refreshConformity relance réellement le contrôle', async () => {
    await store.ensureConformity();
    await store.refreshConformity();
    expect(fake.conformityCalls).toBe(2);
  });

  it('forcedScan vaut true tant que la conformité n a pas répondu', () => {
    expect(store.forcedScan()).toBe(true);
  });

  it('loadMovies alimente le signal movies', async () => {
    await store.loadMovies();
    expect(store.movies()).toHaveLength(1);
    expect(store.movies()[0]?.titleVo).toBe('Alien');
    expect(store.loading()).toBe(false);
  });
});
