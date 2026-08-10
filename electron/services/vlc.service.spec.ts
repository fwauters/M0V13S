/**
 * Tests du service de lecture VLC : faux process (EventEmitter) et faux
 * statuts HTTP — aucun VLC réel. Vérifie la machine à états complète :
 * lancement, reprise sauvegardée au fil de l'eau, vu automatique à 90 %,
 * finalisation à la sortie du process, cas dégradés.
 */
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppDatabaseHandle, openDatabase } from '../db/client';
import { media, videoFiles } from '../db/schema';
import { VlcService } from './vlc.service';
import { WatchService } from './watch.service';

const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');

/** Attend que les ticks de polling asynchrones se déposent. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 30));

let tmpDir: string;
let handle: AppDatabaseHandle;
let watch: WatchService;
let mediaId: number;
/** Faux process VLC : on émet 'exit' pour simuler la fermeture. */
let child: EventEmitter;
/** Statut servi au prochain tick de polling (body de status.json). */
let statusBody: string;

/** Fabrique le service avec toutes les dépendances doublées. */
function makeService(vlcExists = true): VlcService {
  child = new EventEmitter();
  return new VlcService(handle.db, watch, {
    spawnFn: (() => child) as never,
    fetchFn: (async () => new Response(statusBody, { status: 200 })) as typeof fetch,
    vlcPath: () => (vlcExists ? path.join(tmpDir, 'vlc.exe') : path.join(tmpDir, 'absent.exe')),
    driveRoot: () => tmpDir,
    findFreePort: async () => 8123,
    pollIntervalMs: 5,
  });
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm0v13s-vlc-test-'));
  handle = openDatabase(path.join(tmpDir, 'library.db'), MIGRATIONS_DIR);
  watch = new WatchService(handle.db);

  // Un film + son fichier réellement présent sur le « lecteur » tmpDir.
  mediaId = handle.db
    .insert(media)
    .values({ type: 'movie', titleVo: 'Alien', createdAt: 1, updatedAt: 1 })
    .returning({ id: media.id })
    .get().id;
  fs.mkdirSync(path.join(tmpDir, 'Films'));
  fs.writeFileSync(path.join(tmpDir, 'Films', 'alien.mkv'), 'fake');
  fs.writeFileSync(path.join(tmpDir, 'vlc.exe'), 'fake');
  handle.db
    .insert(videoFiles)
    .values({ mediaId, relPath: 'Films/alien.mkv', sizeBytes: 4, mtimeMs: 1, status: 'ok' })
    .run();

  statusBody = JSON.stringify({ state: 'playing', time: 0, length: 7000 });
});

afterEach(() => {
  handle.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('VlcService.play — cas dégradés', () => {
  it('vlcMissing si le binaire portable est absent', async () => {
    expect((await makeService(false).play(mediaId, false)).status).toBe('vlcMissing');
  });

  it('fileMissing si la fiche n a aucun fichier présent', async () => {
    handle.db.update(videoFiles).set({ status: 'missing' }).run();
    expect((await makeService().play(mediaId, false)).status).toBe('fileMissing');
  });

  it('fileMissing si le fichier a disparu du disque', async () => {
    fs.rmSync(path.join(tmpDir, 'Films', 'alien.mkv'));
    expect((await makeService().play(mediaId, false)).status).toBe('fileMissing');
  });

  it('alreadyPlaying tant que la lecture en cours n est pas finie', async () => {
    const service = makeService();
    expect((await service.play(mediaId, false)).status).toBe('ok');
    expect((await service.play(mediaId, false)).status).toBe('alreadyPlaying');

    child.emit('exit', 0);
    expect((await service.play(mediaId, false)).status).toBe('ok');
  });
});

describe('VlcService — suivi de position', () => {
  it('sauvegarde la reprise au fil de la lecture puis à la sortie', async () => {
    const service = makeService();
    await service.play(mediaId, false);

    statusBody = JSON.stringify({ state: 'playing', time: 1200, length: 7000 });
    await settle(); // quelques ticks de polling
    expect(watch.getInfo(mediaId).resumePositionSec).toBe(1200);

    child.emit('exit', 0);
    const info = watch.getInfo(mediaId);
    expect(info.resumePositionSec).toBe(1200);
    expect(info.completed).toBe(false);
  });

  it('pas de reprise si on quitte dans les 60 premières secondes', async () => {
    const service = makeService();
    await service.play(mediaId, false);

    statusBody = JSON.stringify({ state: 'playing', time: 30, length: 7000 });
    await settle();
    child.emit('exit', 0);
    expect(watch.getInfo(mediaId).resumePositionSec).toBeNull();
  });

  it('vu automatique à 90 % : compteur + reprise effacée, une seule fois', async () => {
    const service = makeService();
    await service.play(mediaId, false);

    statusBody = JSON.stringify({ state: 'playing', time: 6500, length: 7000 });
    await settle();
    child.emit('exit', 0);

    const info = watch.getInfo(mediaId);
    expect(info.completed).toBe(true);
    expect(info.watchCount).toBe(1); // un seul enregistrement malgré N ticks
    expect(info.resumePositionSec).toBeNull();
  });

  it('notifie la fin de lecture (une fois) avec le mediaId', async () => {
    const service = makeService();
    const ended = vi.fn();
    service.onEnded(ended);
    await service.play(mediaId, false);

    child.emit('exit', 0);
    child.emit('error', new Error('doublon')); // exit + error : une seule finalisation
    expect(ended).toHaveBeenCalledTimes(1);
    expect(ended).toHaveBeenCalledWith(mediaId);
  });

  it('reprend à la position sauvegardée (argument --start-time)', async () => {
    watch.saveResume(mediaId, 1200);
    let spawnedArgs: string[] = [];
    child = new EventEmitter();
    const service = new VlcService(handle.db, watch, {
      spawnFn: ((_cmd: string, args: string[]) => {
        spawnedArgs = args;
        return child;
      }) as never,
      fetchFn: (async () => new Response(statusBody, { status: 200 })) as typeof fetch,
      vlcPath: () => path.join(tmpDir, 'vlc.exe'),
      driveRoot: () => tmpDir,
      findFreePort: async () => 8123,
      pollIntervalMs: 5,
    });

    await service.play(mediaId, true);
    expect(spawnedArgs.join(' ')).toContain('--start-time 1200');
    child.emit('exit', 0);
  });
});
