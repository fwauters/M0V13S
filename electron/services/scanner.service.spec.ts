/**
 * Tests du scanner sur DB temporaire : qualification manuelle (fiche +
 * relations), rattachement multi-parties, re-lien, suppression confirmée.
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
import { ScannerService } from './scanner.service';
import { SettingsService } from './settings.service';

const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');

let tmpDir: string;
let handle: AppDatabaseHandle;
let db: AppDatabase;
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
    directors: ['Ridley Scott'],
    writers: ['Jon Spaihts', 'Damon Lindelof'],
    actors: ['Noomi Rapace', 'Michael Fassbender'],
    genres: ['Science-Fiction', 'Horreur'],
    tags: ['alien'],
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm0v13s-scanner-test-'));
  handle = openDatabase(path.join(tmpDir, 'library.db'), MIGRATIONS_DIR);
  db = handle.db;
  scanner = new ScannerService(db, new SettingsService(db));
});

afterEach(() => {
  handle.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('ScannerService.qualify', () => {
  it('crée la fiche complète : média + fichier + personnes + genres + tags', () => {
    const mediaId = scanner.qualify(makeInput());

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
  });

  it('réutilise les personnes/genres/tags existants (pas de doublon)', () => {
    scanner.qualify(makeInput());
    scanner.qualify(
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

  it('rattache un CD2 à la fiche existante du même titre', () => {
    const id1 = scanner.qualify(
      makeInput({ relPath: 'Films/Avatar/avatar.cd1.avi', titleVo: 'Avatar', partNumber: 1 }),
    );
    const id2 = scanner.qualify(
      makeInput({ relPath: 'Films/Avatar/avatar.cd2.avi', titleVo: 'Avatar', partNumber: 2 }),
    );

    expect(id2).toBe(id1);
    expect(db.select().from(media).all()).toHaveLength(1);
    expect(db.select().from(videoFiles).all()).toHaveLength(2);
  });
});

describe('ScannerService.relink / deleteMedia', () => {
  it('relink met à jour le chemin et repasse le fichier en ok', () => {
    const mediaId = scanner.qualify(makeInput());
    const file = db.select().from(videoFiles).where(eq(videoFiles.mediaId, mediaId)).get();

    // Simule la disparition (conformité) puis le re-lien du scan.
    db.update(videoFiles).set({ status: 'missing' }).run();
    scanner.relink(file!.id, 'Films/Renomme/prometheus-final.mkv', 4_700_000_000, 1_800_000_000_000);

    const updated = db.select().from(videoFiles).where(eq(videoFiles.id, file!.id)).get();
    expect(updated?.relPath).toBe('Films/Renomme/prometheus-final.mkv');
    expect(updated?.status).toBe('ok');
  });

  it('deleteMedia supprime fiche, fichier et jonctions (cascade)', () => {
    const mediaId = scanner.qualify(makeInput());
    scanner.deleteMedia(mediaId);

    expect(db.select().from(media).all()).toHaveLength(0);
    expect(db.select().from(videoFiles).all()).toHaveLength(0);
    expect(db.select().from(mediaPeople).all()).toHaveLength(0);
    expect(db.select().from(mediaGenres).all()).toHaveLength(0);
  });
});
