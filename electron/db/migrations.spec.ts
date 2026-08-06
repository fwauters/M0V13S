/**
 * Tests des migrations Drizzle sur une base TEMPORAIRE (règle CLAUDE.md).
 * Vérifie que la chaîne openDatabase -> migrations produit un schéma
 * complet et que les garde-fous structurels (CHECK propriétaire unique,
 * suppressions en cascade) fonctionnent réellement dans SQLite.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppDatabase, AppDatabaseHandle, openDatabase } from './client';
import { media, videoFiles, watchState } from './schema';

/** Dossier des migrations, résolu depuis la racine du repo. */
const MIGRATIONS_DIR = path.resolve(__dirname, 'migrations');

let tmpDir: string;
let handle: AppDatabaseHandle;
let db: AppDatabase;

beforeEach(() => {
  // Une base neuve par test, dans un dossier temporaire jetable.
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm0v13s-db-test-'));
  handle = openDatabase(path.join(tmpDir, 'library.db'), MIGRATIONS_DIR);
  db = handle.db;
});

afterEach(() => {
  // Fermer la connexion AVANT de supprimer le dossier (sinon EBUSY sur
  // Windows : le fichier .db est verrouillé par le process).
  handle.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('migrations', () => {
  it('crée toutes les tables du schéma (PLAN § 5)', () => {
    const rows = db.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' ORDER BY name`,
    );
    const names = rows.map((r) => r.name);
    expect(names).toEqual([
      'episodes',
      'genres',
      'media',
      'media_genres',
      'media_people',
      'media_tags',
      'people',
      'seasons',
      'settings',
      'tags',
      'video_files',
      'watch_state',
    ]);
  });

  it('accepte un film complet avec son fichier', () => {
    // Driver synchrone : `.returning()` doit être exécuté via `.get()`.
    const movie = db
      .insert(media)
      .values({ type: 'movie', titleVo: 'Alien', year: 1979 })
      .returning()
      .get();
    expect(movie).toBeDefined();

    db.insert(videoFiles)
      .values({
        mediaId: movie.id,
        relPath: 'Films/Alien (1979)/alien.mkv',
        sizeBytes: 1234,
        mtimeMs: 5678,
      })
      .run();

    const files = db.select().from(videoFiles).all();
    expect(files).toHaveLength(1);
    expect(files[0]!.status).toBe('ok');
  });

  it('CHECK : un fichier sans propriétaire (ni film ni épisode) est refusé', () => {
    expect(() =>
      db
        .insert(videoFiles)
        .values({ relPath: 'orphelin.mkv', sizeBytes: 1, mtimeMs: 1 })
        .run(),
    ).toThrow(/CHECK|constraint/i);
  });

  it('CHECK : un état de visionnage sans propriétaire est refusé', () => {
    expect(() => db.insert(watchState).values({ watchCount: 1 }).run()).toThrow(
      /CHECK|constraint/i,
    );
  });

  it('supprime en cascade fichiers et état quand la fiche est supprimée', () => {
    const movie = db
      .insert(media)
      .values({ type: 'movie', titleVo: 'Alien' })
      .returning()
      .get();
    db.insert(videoFiles)
      .values({ mediaId: movie.id, relPath: 'a.mkv', sizeBytes: 1, mtimeMs: 1 })
      .run();
    db.insert(watchState).values({ mediaId: movie.id, watchCount: 2 }).run();

    db.delete(media).run();

    expect(db.select().from(videoFiles).all()).toHaveLength(0);
    expect(db.select().from(watchState).all()).toHaveLength(0);
  });
});
