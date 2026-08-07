import { TestBed } from '@angular/core/testing';
import type { ScanResult } from '@shared/dto';

import { appConfig } from '../../app.config';
import { ApiService } from '../../core/services/api.service';
import { Scan } from './scan';

/**
 * Tests de non-régression de l'assistant de qualification.
 * Bug relevé en validation de phase 1 : les saisies du film précédent
 * persistaient dans le formulaire au passage au fichier suivant.
 */

/** Résultat de scan : deux nouveaux fichiers « film ». */
const SCAN_RESULT: ScanResult = {
  newFiles: [
    {
      relPath: 'Films/Alpha.2001.mkv',
      sizeBytes: 100,
      mtimeMs: 1,
      tech: null,
      guess: { title: 'Alpha', year: 2001, partNumber: null, looksLikeEpisode: false },
      existing: null,
      loose: false,
    },
    {
      relPath: 'Films/Beta.mkv',
      sizeBytes: 200,
      mtimeMs: 2,
      tech: null,
      guess: { title: 'Beta', year: null, partNumber: null, looksLikeEpisode: false },
      existing: null,
      loose: false,
    },
  ],
  missingFiles: [],
  relinkCandidates: [],
  importedFromNfo: [],
};

/** Double d'ApiService : uniquement ce que Scan et LibraryStore consomment. */
function makeApiMock() {
  return {
    getLibraryRoots: async () => ['Films'],
    setLibraryRoots: async () => undefined,
    onScanProgress: () => () => undefined,
    scan: async () => SCAN_RESULT,
    cancelScan: async () => undefined,
    qualify: async () => 1,
    relink: async () => undefined,
    deleteMedia: async () => undefined,
    checkConformity: async () => ({
      recognizedCount: 1,
      missingCount: 0,
      toQualifyCount: 0,
      forcedScan: false,
    }),
    listMovies: async () => [],
    // TMDB : l'assistant lance une recherche automatique par fichier —
    // le double répond « pas de clé » (aucun réseau en test).
    searchTmdb: async () => ({ status: 'noKey', httpStatus: null, results: [] }),
    getTmdbDetails: async () => ({ status: 'noKey', httpStatus: null, details: null }),
    getTmdbLanguageConfig: async () => ({
      metadataLanguage: 'fr-FR',
      trailerLanguage: 'original',
    }),
  };
}

describe('Scan — assistant de qualification', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Scan],
      providers: [
        ...appConfig.providers,
        { provide: ApiService, useValue: makeApiMock() },
      ],
    }).compileComponents();
  });

  it('réinitialise le brouillon en passant au fichier suivant (non-régression)', async () => {
    const fixture = TestBed.createComponent(Scan);
    const component = fixture.componentInstance;
    await fixture.whenStable();

    // Scan : le brouillon du 1er fichier est prérempli depuis le nom.
    await component['startScan']();
    expect(component['draft'].titleVo).toBe('Alpha');
    expect(component['draft'].year).toBe(2001);

    // L'utilisateur complète la fiche du 1er film…
    component['draft'].titleVf = 'Alpha VF';
    component['draft'].overview = 'Synopsis du premier film';
    component['draft'].directors = ['Ridley Scott'];
    component['draft'].writers = ['Jon Spaihts'];

    // …enregistre, et passe au 2e fichier : TOUT doit être réinitialisé.
    await component['saveCurrent']();
    expect(component['draft'].titleVo).toBe('Beta');
    expect(component['draft'].year).toBeNull();
    expect(component['draft'].titleVf).toBe('');
    expect(component['draft'].overview).toBe('');
    expect(component['draft'].directors).toEqual([]);
    expect(component['draft'].writers).toEqual([]);
  });

  it('ignore un fichier sans toucher aux suivants (skip)', async () => {
    const fixture = TestBed.createComponent(Scan);
    const component = fixture.componentInstance;
    await fixture.whenStable();

    await component['startScan']();
    component['draft'].directors = ['Quelqu un'];
    component['skipCurrent']();

    expect(component['draft'].titleVo).toBe('Beta');
    expect(component['draft'].directors).toEqual([]);
  });
});
