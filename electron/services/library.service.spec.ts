/**
 * Tests du service de lecture de la bibliothèque sur DB temporaire :
 * règle d'affichage « présent ET reconnu », et enrichissement de la liste
 * pour le browse (genres, tags, personnes, date d'ajout, état « vu »).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppDatabaseHandle, openDatabase } from '../db/client';
import {
  genres,
  media,
  mediaGenres,
  mediaPeople,
  mediaTags,
  people,
  tags,
  videoFiles,
  watchState,
} from '../db/schema';
import { LibraryService } from './library.service';

const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');

let tmpDir: string;
let handle: AppDatabaseHandle;
let service: LibraryService;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm0v13s-library-test-'));
  handle = openDatabase(path.join(tmpDir, 'library.db'), MIGRATIONS_DIR);
  service = new LibraryService(handle.db);
});

afterEach(() => {
  handle.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Insère un film + son fichier et retourne l'id de la fiche. */
function seedMovie(input: {
  titleVo: string;
  status?: 'ok' | 'missing';
  createdAt?: number;
}): number {
  const inserted = handle.db
    .insert(media)
    .values({
      type: 'movie',
      titleVo: input.titleVo,
      createdAt: input.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    })
    .returning({ id: media.id })
    .get();
  handle.db
    .insert(videoFiles)
    .values({
      mediaId: inserted.id,
      relPath: `Films/${input.titleVo}/${input.titleVo}.mkv`,
      sizeBytes: 1000,
      mtimeMs: 1,
      status: input.status ?? 'ok',
    })
    .run();
  return inserted.id;
}

describe('LibraryService.listMovies — browse enrichi', () => {
  it('n affiche que les films avec au moins un fichier présent', () => {
    seedMovie({ titleVo: 'Alien' });
    seedMovie({ titleVo: 'Disparu', status: 'missing' });

    const list = service.listMovies();
    expect(list.map((m) => m.titleVo)).toEqual(['Alien']);
  });

  it('embarque genres, tags, réalisateurs/acteurs, date d ajout et vu', () => {
    const id = seedMovie({ titleVo: 'Alien', createdAt: 424242 });

    const genre = handle.db
      .insert(genres)
      .values({ name: 'SF' })
      .returning({ id: genres.id })
      .get();
    handle.db.insert(mediaGenres).values({ mediaId: id, genreId: genre.id }).run();

    const tag = handle.db
      .insert(tags)
      .values({ name: 'huis clos' })
      .returning({ id: tags.id })
      .get();
    handle.db.insert(mediaTags).values({ mediaId: id, tagId: tag.id }).run();

    const director = handle.db
      .insert(people)
      .values({ name: 'Ridley Scott' })
      .returning({ id: people.id })
      .get();
    const actor = handle.db
      .insert(people)
      .values({ name: 'Sigourney Weaver' })
      .returning({ id: people.id })
      .get();
    const writer = handle.db
      .insert(people)
      .values({ name: 'Dan O’Bannon' })
      .returning({ id: people.id })
      .get();
    handle.db
      .insert(mediaPeople)
      .values([
        { mediaId: id, personId: director.id, role: 'director', sortOrder: 0 },
        { mediaId: id, personId: actor.id, role: 'actor', character: 'Ripley', sortOrder: 1 },
        // Les scénaristes ne remontent PAS dans la liste (fiche détail seulement).
        { mediaId: id, personId: writer.id, role: 'writer', sortOrder: 2 },
      ])
      .run();

    handle.db
      .insert(watchState)
      .values({
        mediaId: id,
        completed: true,
        watchCount: 2,
        resumePositionSec: 900,
        lastWatchedAt: 424999,
      })
      .run();

    const [movie] = service.listMovies();
    expect(movie).toMatchObject({
      titleVo: 'Alien',
      genres: ['SF'],
      tags: ['huis clos'],
      directors: ['Ridley Scott'],
      actors: ['Sigourney Weaver'],
      addedAt: 424242,
      // Visionnage complet exposé (suggestions de la phase 5).
      seen: true,
      watchCount: 2,
      resumePositionSec: 900,
      lastWatchedAt: 424999,
    });
  });

  it('un film sans watch_state (ou non terminé) est « pas vu »', () => {
    const id = seedMovie({ titleVo: 'Alien' });
    seedMovie({ titleVo: 'Blade Runner' });
    handle.db.insert(watchState).values({ mediaId: id, completed: false }).run();

    const list = service.listMovies();
    expect(list.every((m) => !m.seen)).toBe(true);
  });

  it('un film multi-fichiers n apparaît qu une fois, première durée connue', () => {
    const id = seedMovie({ titleVo: 'Novecento' });
    handle.db
      .insert(videoFiles)
      .values({
        mediaId: id,
        relPath: 'Films/Novecento/Novecento-cd2.mkv',
        sizeBytes: 1000,
        mtimeMs: 1,
        durationSec: 9000,
        partNumber: 2,
        status: 'ok',
      })
      .run();

    const list = service.listMovies();
    expect(list).toHaveLength(1);
    expect(list[0]?.durationSec).toBe(9000);
  });
});

describe('LibraryService.getMovie — langues des pistes', () => {
  it('restitue audio/sous-titres stockés, [] pour un fichier ancien (null)', () => {
    const id = seedMovie({ titleVo: 'Alien' });
    // Le fichier seedé (langs null = analysé avant l'ajout de l'info)
    // cohabite avec un fichier récent porteur de langues.
    handle.db
      .insert(videoFiles)
      .values({
        mediaId: id,
        relPath: 'Films/Alien/Alien-vf.mkv',
        sizeBytes: 2000,
        mtimeMs: 2,
        partNumber: 2,
        status: 'ok',
        audioLangs: ['fre', 'eng'],
        subtitleLangs: ['fre'],
      })
      .run();

    const movie = service.getMovie(id);
    const techs = movie?.files.map((f) => f.tech) ?? [];
    expect(techs[0]?.audioLangs).toEqual([]); // null en base → [] côté DTO
    expect(techs[1]?.audioLangs).toEqual(['fre', 'eng']);
    expect(techs[1]?.subtitleLangs).toEqual(['fre']);
  });
});
