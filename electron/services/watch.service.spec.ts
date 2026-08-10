/**
 * Tests du suivi de visionnage sur DB temporaire : reprise, complétion,
 * marquage manuel — le watch_state reste personnel (jamais dans les .nfo,
 * vérifié par ailleurs dans nfo.service).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppDatabaseHandle, openDatabase } from '../db/client';
import { media } from '../db/schema';
import { WatchService } from './watch.service';

const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');

let tmpDir: string;
let handle: AppDatabaseHandle;
let service: WatchService;
let mediaId: number;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm0v13s-watch-test-'));
  handle = openDatabase(path.join(tmpDir, 'library.db'), MIGRATIONS_DIR);
  service = new WatchService(handle.db);
  mediaId = handle.db
    .insert(media)
    .values({ type: 'movie', titleVo: 'Alien', createdAt: 1, updatedAt: 1 })
    .returning({ id: media.id })
    .get().id;
});

afterEach(() => {
  handle.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('WatchService', () => {
  it('retourne des zéros pour un film jamais lu', () => {
    expect(service.getInfo(mediaId)).toEqual({
      completed: false,
      watchCount: 0,
      resumePositionSec: null,
      lastWatchedAt: null,
    });
  });

  it('sauvegarde et écrase la position de reprise (upsert)', () => {
    service.saveResume(mediaId, 1200);
    expect(service.getInfo(mediaId).resumePositionSec).toBe(1200);

    service.saveResume(mediaId, 1500);
    expect(service.getInfo(mediaId).resumePositionSec).toBe(1500);
  });

  it('registerCompletion : vu, compteur incrémenté, reprise effacée', () => {
    service.saveResume(mediaId, 1200);
    service.registerCompletion(mediaId);

    const info = service.getInfo(mediaId);
    expect(info.completed).toBe(true);
    expect(info.watchCount).toBe(1);
    expect(info.resumePositionSec).toBeNull();
    expect(info.lastWatchedAt).not.toBeNull();

    // Second visionnage complet : le compteur monte.
    service.registerCompletion(mediaId);
    expect(service.getInfo(mediaId).watchCount).toBe(2);
  });

  it('revoir un film vu : la reprise revit SANS toucher à l historique', () => {
    service.registerCompletion(mediaId);
    service.saveResume(mediaId, 300);

    const info = service.getInfo(mediaId);
    expect(info.completed).toBe(true); // l'historique reste
    expect(info.watchCount).toBe(1);
    expect(info.resumePositionSec).toBe(300);
  });

  it('marquage manuel vu : compteur au moins 1, reprise effacée', () => {
    service.saveResume(mediaId, 1200);
    const info = service.setCompleted(mediaId, true);
    expect(info.completed).toBe(true);
    expect(info.watchCount).toBe(1);
    expect(info.resumePositionSec).toBeNull();
  });

  it('marquage manuel pas vu : drapeau retiré, historique conservé', () => {
    service.registerCompletion(mediaId);
    service.registerCompletion(mediaId);

    const info = service.setCompleted(mediaId, false);
    expect(info.completed).toBe(false);
    expect(info.watchCount).toBe(2); // l'historique n'est pas réécrit
    expect(info.resumePositionSec).toBeNull(); // pas vu = repartir de zéro
  });
});
