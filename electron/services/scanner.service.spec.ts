/**
 * Tests du scanner sur DB temporaire : qualification manuelle (fiche +
 * relations + écriture du sidecar .nfo), rattachement multi-parties,
 * import silencieux des fichiers arrivés avec leur .nfo, re-lien,
 * suppression confirmée.
 * (Le parcours disque et le diff sont couverts par walker.service.spec et
 * conformity.logic.spec ; ffprobe par ffprobe.service.spec.)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { QualifyMovieInput } from '@shared/dto';
import { AppDatabase, AppDatabaseHandle, openDatabase } from '../db/client';
import {
  media,
  mediaGenres,
  mediaPeople,
  mediaTags,
  people,
  videoFiles,
} from '../db/schema';
import { MovieNfo, buildMovieNfoXml, parseMovieNfoXml } from './nfo.service';
import { ScannerService } from './scanner.service';
import { SettingsService } from './settings.service';

const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');

let tmpDir: string;
let handle: AppDatabaseHandle;
let db: AppDatabase;
let settings: SettingsService;
let scanner: ScannerService;

/** Saisie de qualification complète et réaliste. */
function makeInput(overrides: Partial<QualifyMovieInput> = {}): QualifyMovieInput {
  return {
    relPath: 'Films/Prometheus (2012)/prometheus.mkv',
    sizeBytes: 4_700_000_000,
    mtimeMs: 1_700_000_000_000,
    tech: { durationSec: 7440, videoCodec: 'hevc', audioCodec: 'dts', width: 1920, height: 1080 },
    partNumber: null,
    titleVo: 'Prometheus',
    titleVf: 'Prometheus',
    year: 2012,
    overview: 'Des scientifiques partent aux origines de l’humanité.',
    personalRating: 8,
    personalNotes: 'Mon film de chevet.',
    tmdbRating: null,
    tmdbId: null,
    trailerYoutubeKey: null,
    tmdbPosterPath: null,
    tmdbBackdropPath: null,
    directors: ['Ridley Scott'],
    writers: ['Jon Spaihts', 'Damon Lindelof'],
    actors: [
      { name: 'Noomi Rapace', character: 'Elizabeth Shaw' },
      { name: 'Michael Fassbender', character: 'David' },
    ],
    genres: ['Science-Fiction', 'Horreur'],
    tags: ['alien'],
    ...overrides,
  };
}

/** Fiche `.nfo` de référence pour les tests d'import silencieux. */
const ALIEN_NFO: MovieNfo = {
  titleVo: 'Alien',
  titleVf: 'Alien, le huitième passager',
  year: 1979,
  overview: 'Un vaisseau reçoit un signal inconnu.',
  personalRating: null,
  personalNotes: null,
  tmdbRating: 8.1,
  tmdbId: 348,
  trailerYoutubeKey: 'jQ5lPt9edzQ',
  directors: ['Ridley Scott'],
  writers: ['Dan O’Bannon'],
  actors: [{ name: 'Sigourney Weaver', character: 'Ripley' }],
  genres: ['Science-Fiction'],
  tags: ['alien'],
};

/** Crée un faux fichier vidéo (+ .nfo optionnel) sous la racine temporaire. */
function makeVideoFile(relPath: string, nfo: MovieNfo | null): void {
  const absPath = path.join(tmpDir, ...relPath.split('/'));
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, 'faux contenu vidéo');
  if (nfo !== null) {
    const nfoPath = absPath.slice(0, -path.extname(absPath).length) + '.nfo';
    fs.writeFileSync(nfoPath, buildMovieNfoXml(nfo), 'utf8');
  }
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm0v13s-scanner-test-'));
  handle = openDatabase(path.join(tmpDir, 'library.db'), MIGRATIONS_DIR);
  db = handle.db;
  settings = new SettingsService(db);
  // Racine du lecteur INJECTÉE : tout se passe dans le dossier temporaire.
  scanner = new ScannerService(db, settings, () => tmpDir);
});

afterEach(() => {
  handle.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ScannerService.qualify', () => {
  it('crée la fiche complète : média + fichier + personnes + genres + tags', async () => {
    const mediaId = await scanner.qualify(makeInput());

    const m = db.select().from(media).where(eq(media.id, mediaId)).get();
    expect(m?.titleVo).toBe('Prometheus');
    expect(m?.type).toBe('movie');

    const files = db.select().from(videoFiles).all();
    expect(files).toHaveLength(1);
    expect(files[0]!.durationSec).toBe(7440);
    expect(files[0]!.status).toBe('ok');

    // 1 réalisateur + 2 scénaristes + 2 acteurs = 5 liens de personnes.
    expect(db.select().from(mediaPeople).all()).toHaveLength(5);
    expect(db.select().from(mediaGenres).all()).toHaveLength(2);
    expect(db.select().from(mediaTags).all()).toHaveLength(1);

    // Le personnage des acteurs est conservé (viendra des .nfo et de TMDB).
    const characters = db.select().from(mediaPeople).all().map((p) => p.character);
    expect(characters).toContain('Elizabeth Shaw');
  });

  it('écrit le sidecar .nfo à côté du fichier qualifié (aller-retour)', async () => {
    makeVideoFile('Films/Prometheus (2012)/prometheus.mkv', null);
    await scanner.qualify(makeInput());

    const nfoPath = path.join(tmpDir, 'Films', 'Prometheus (2012)', 'prometheus.nfo');
    expect(fs.existsSync(nfoPath)).toBe(true);
    const parsed = parseMovieNfoXml(fs.readFileSync(nfoPath, 'utf8'));
    expect(parsed?.titleVo).toBe('Prometheus');
    expect(parsed?.actors).toEqual(makeInput().actors);
  });

  it('réutilise les personnes/genres/tags existants (pas de doublon)', async () => {
    await scanner.qualify(makeInput());
    await scanner.qualify(
      makeInput({
        relPath: 'Films/Alien (1979)/alien.mkv',
        titleVo: 'Alien',
        directors: ['Ridley Scott'], // déjà en base
        writers: [],
        actors: [],
        genres: ['Science-Fiction'], // déjà en base
        tags: ['alien'], // déjà en base
      }),
    );

    // Les référentiels ne grossissent pas en doublons.
    const allPeople = db.select().from(people).all();
    expect(allPeople.filter((p) => p.name === 'Ridley Scott')).toHaveLength(1);
  });

  it('rattache un CD2 à la fiche existante du même titre', async () => {
    const id1 = await scanner.qualify(
      makeInput({ relPath: 'Films/Avatar/avatar.cd1.avi', titleVo: 'Avatar', partNumber: 1 }),
    );
    const id2 = await scanner.qualify(
      makeInput({ relPath: 'Films/Avatar/avatar.cd2.avi', titleVo: 'Avatar', partNumber: 2 }),
    );

    expect(id2).toBe(id1);
    expect(db.select().from(media).all()).toHaveLength(1);
    expect(db.select().from(videoFiles).all()).toHaveLength(2);
  });
});

describe('ScannerService.scan — import silencieux des .nfo (PLAN § 6.2.2)', () => {
  beforeEach(() => {
    settings.setLibraryRoots(['Films']);
  });

  it('importe sans question un fichier arrivé avec son .nfo (+ images sidecar)', async () => {
    makeVideoFile('Films/Alien (1979)/alien.mkv', ALIEN_NFO);
    makeVideoFile('Films/Inconnu (2020)/inconnu.mkv', null);
    // Image sidecar arrivée avec le dossier partagé.
    fs.writeFileSync(path.join(tmpDir, 'Films', 'Alien (1979)', 'alien-poster.jpg'), 'affiche');

    const result = await scanner.scan();

    // Le fichier avec .nfo est importé ; l'autre part en qualification.
    expect(result.importedFromNfo).toEqual([
      { relPath: 'Films/Alien (1979)/alien.mkv', title: 'Alien, le huitième passager' },
    ]);
    expect(result.newFiles.map((f) => f.relPath)).toEqual(['Films/Inconnu (2020)/inconnu.mkv']);

    // La fiche est complète en base (tmdbId, personnage d'acteur, image
    // sidecar rattachée en chemin RELATIF).
    const m = db.select().from(media).all();
    expect(m).toHaveLength(1);
    expect(m[0]!.tmdbId).toBe(348);
    expect(m[0]!.posterPath).toBe('Films/Alien (1979)/alien-poster.jpg');
    expect(m[0]!.backdropPath).toBeNull();
    const characters = db.select().from(mediaPeople).all().map((p) => p.character);
    expect(characters).toContain('Ripley');
  });

  it('n importe pas deux fois : un second scan ne voit plus le fichier', async () => {
    makeVideoFile('Films/Alien (1979)/alien.mkv', ALIEN_NFO);
    await scanner.scan();
    const second = await scanner.scan();

    expect(second.importedFromNfo).toEqual([]);
    expect(second.newFiles).toEqual([]);
    expect(db.select().from(media).all()).toHaveLength(1);
  });

  it('ne réécrit PAS un .nfo existant à l import (données d autres outils)', async () => {
    makeVideoFile('Films/Alien (1979)/alien.mkv', ALIEN_NFO);
    const nfoPath = path.join(tmpDir, 'Films', 'Alien (1979)', 'alien.nfo');
    const before = fs.readFileSync(nfoPath, 'utf8');

    await scanner.scan();

    expect(fs.readFileSync(nfoPath, 'utf8')).toBe(before);
  });

  it('regroupe les parties CD1/CD2 partageant le même tmdbId', async () => {
    makeVideoFile('Films/Avatar/avatar.cd1.avi', { ...ALIEN_NFO, titleVo: 'Avatar', tmdbId: 19995 });
    makeVideoFile('Films/Avatar/avatar.cd2.avi', { ...ALIEN_NFO, titleVo: 'Avatar', tmdbId: 19995 });

    const result = await scanner.scan();

    expect(result.importedFromNfo).toHaveLength(2);
    expect(db.select().from(media).all()).toHaveLength(1);
    expect(db.select().from(videoFiles).all()).toHaveLength(2);
  });
});

describe('ScannerService — scan complet forcé et mise à jour de fiche', () => {
  beforeEach(() => {
    settings.setLibraryRoots(['Films']);
  });

  it('scan normal : rien à requalifier quand tout est indexé ; scan complet : tout repasse, prérempli', async () => {
    makeVideoFile('Films/Prometheus (2012)/prometheus.mkv', null);
    await scanner.qualify(makeInput());

    // Scan normal : bibliothèque conforme, rien à proposer.
    const normal = await scanner.scan();
    expect(normal.newFiles).toEqual([]);

    // Scan complet : le fichier indexé repasse, prérempli avec sa fiche.
    const full = await scanner.scan(undefined, { full: true });
    expect(full.newFiles).toHaveLength(1);
    const existing = full.newFiles[0]!.existing;
    expect(existing?.titleVo).toBe('Prometheus');
    expect(existing?.genres).toEqual(['Science-Fiction', 'Horreur']);
    expect(existing?.actors).toEqual(makeInput().actors);
  });

  it('requalifier un fichier déjà indexé MET À JOUR la fiche (aucun doublon)', async () => {
    makeVideoFile('Films/Prometheus (2012)/prometheus.mkv', null);
    const id1 = await scanner.qualify(makeInput());
    const id2 = await scanner.qualify(
      makeInput({
        titleVf: 'Prometheus — édition corrigée',
        personalRating: 9,
        genres: ['Science-Fiction'], // « Horreur » retiré
      }),
    );

    expect(id2).toBe(id1);
    const allMedia = db.select().from(media).all();
    expect(allMedia).toHaveLength(1);
    expect(allMedia[0]!.titleVf).toBe('Prometheus — édition corrigée');
    expect(allMedia[0]!.personalRating).toBe(9);
    expect(db.select().from(videoFiles).all()).toHaveLength(1);
    // Les relations reflètent exactement la nouvelle saisie.
    expect(db.select().from(mediaGenres).all()).toHaveLength(1);
  });

  it('scan complet : les .nfo des fichiers indexés ne sont PAS ré-importés', async () => {
    makeVideoFile('Films/Alien (1979)/alien.mkv', ALIEN_NFO);
    await scanner.scan(); // import silencieux initial

    const full = await scanner.scan(undefined, { full: true });
    expect(full.importedFromNfo).toEqual([]);
    expect(full.newFiles).toHaveLength(1); // repasse en assistant (mise à jour)
    expect(db.select().from(media).all()).toHaveLength(1); // pas de doublon
  });
});

describe('ScannerService.enrichMedia (bouton « Compléter via TMDB »)', () => {
  it('met à jour la fiche depuis TMDB en CONSERVANT tags et note perso', async () => {
    makeVideoFile('Films/Prometheus (2012)/prometheus.mkv', null);
    const mediaId = await scanner.qualify(
      makeInput({ titleVf: 'Titre approximatif', genres: ['Inconnu'], tags: ['a-revoir'] }),
    );

    const enriched = await scanner.enrichMedia(mediaId, {
      tmdbId: 70981,
      titleVo: 'Prometheus',
      titleVf: 'Prometheus (VF officielle)',
      year: 2012,
      overview: 'Synopsis officiel TMDB.',
      genres: ['Science-Fiction', 'Aventure'],
      directors: ['Ridley Scott'],
      writers: ['Jon Spaihts', 'Damon Lindelof'],
      actors: [{ name: 'Noomi Rapace', character: 'Elizabeth Shaw' }],
      trailerYoutubeKey: 'trailerKey',
      tmdbRating: 7.9,
      tmdbPosterPath: null, // pas de téléchargement dans ce test (hors ligne)
      tmdbBackdropPath: null,
    });

    expect(enriched).toBe(true);
    const m = db.select().from(media).all();
    expect(m).toHaveLength(1); // toujours pas de doublon
    expect(m[0]!.titleVf).toBe('Prometheus (VF officielle)');
    expect(m[0]!.tmdbId).toBe(70981);
    expect(m[0]!.trailerYoutubeKey).toBe('trailerKey');
    expect(m[0]!.tmdbRating).toBe(7.9); // note TMDB enregistrée
    expect(m[0]!.personalRating).toBe(8); // note perso CONSERVÉE
    expect(m[0]!.personalNotes).toBe('Mon film de chevet.'); // avis CONSERVÉ
    // Genres remplacés par TMDB, tags personnels conservés.
    expect(db.select().from(mediaGenres).all()).toHaveLength(2);
    expect(db.select().from(mediaTags).all()).toHaveLength(1);
    // Le .nfo reflète la fiche enrichie.
    const nfoPath = path.join(tmpDir, 'Films', 'Prometheus (2012)', 'prometheus.nfo');
    expect(parseMovieNfoXml(fs.readFileSync(nfoPath, 'utf8'))?.tmdbId).toBe(70981);
  });

  it('retourne faux pour une fiche sans fichier rattaché', async () => {
    expect(
      await scanner.enrichMedia(999, {
        tmdbId: 1, titleVo: 'X', titleVf: null, year: null, overview: null,
        genres: [], directors: [], writers: [], actors: [],
        trailerYoutubeKey: null, tmdbRating: null,
        tmdbPosterPath: null, tmdbBackdropPath: null,
      }),
    ).toBe(false);
  });
});

describe('ScannerService.relink / deleteMedia', () => {
  it('relink met à jour le chemin et repasse le fichier en ok', async () => {
    const mediaId = await scanner.qualify(makeInput());
    const file = db.select().from(videoFiles).where(eq(videoFiles.mediaId, mediaId)).get();

    // Simule la disparition (conformité) puis le re-lien du scan.
    db.update(videoFiles).set({ status: 'missing' }).run();
    scanner.relink(file!.id, 'Films/Renomme/prometheus-final.mkv', 4_700_000_000, 1_800_000_000_000);

    const updated = db.select().from(videoFiles).where(eq(videoFiles.id, file!.id)).get();
    expect(updated?.relPath).toBe('Films/Renomme/prometheus-final.mkv');
    expect(updated?.status).toBe('ok');
  });

  it('deleteMedia supprime fiche, fichier et jonctions (cascade)', async () => {
    const mediaId = await scanner.qualify(makeInput());
    scanner.deleteMedia(mediaId);

    expect(db.select().from(media).all()).toHaveLength(0);
    expect(db.select().from(videoFiles).all()).toHaveLength(0);
    expect(db.select().from(mediaPeople).all()).toHaveLength(0);
    expect(db.select().from(mediaGenres).all()).toHaveLength(0);
  });
});
