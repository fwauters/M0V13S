/**
 * Tests du service de mise à jour VLC sur dossier temporaire : faux
 * réseau (index + zip), faux unzip — vérifie staging, bascule au
 * démarrage avec secours, et cas dégradés sans dégât.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { VlcUpdaterService } from './vlc-updater.service';

let toolsDir: string;

/** Index HTML minimal renvoyé par le faux videolan.org. */
const LISTING = '<a href="vlc-9.9.9-win64.zip">zip</a>';

/** Fabrique un faux dossier VLC (vlc.exe + marqueur de version). */
function makeVlcDir(dir: string, version: string | null): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'vlc.exe'), 'fake');
  if (version !== null) {
    fs.writeFileSync(path.join(dir, '.version'), version, 'utf8');
  }
}

/**
 * Faux unzip : simule l'extraction du zip officiel (un dossier
 * vlc-<version> contenant vlc.exe).
 */
function fakeUnzip(_zipPath: string, destDir: string): void {
  makeVlcDir(path.join(destDir, 'vlc-9.9.9'), null);
}

/** Faux fetch : index HTML, ou contenu binaire factice pour le zip. */
const fakeFetch = (async (url: string | URL | Request) => {
  const href = String(url);
  if (href.endsWith('.zip')) {
    return new Response('zipdata', { status: 200 });
  }
  return new Response(LISTING, { status: 200 });
}) as typeof fetch;

function makeService(fetchFn: typeof fetch = fakeFetch): VlcUpdaterService {
  return new VlcUpdaterService({
    fetchFn,
    toolsDir: () => toolsDir,
    unzipFn: fakeUnzip,
  });
}

beforeEach(() => {
  toolsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm0v13s-vlcupd-test-'));
});

afterEach(() => {
  fs.rmSync(toolsDir, { recursive: true, force: true });
});

describe('VlcUpdaterService.getState / check', () => {
  it('expose présence et versions (installée, en attente)', () => {
    makeVlcDir(path.join(toolsDir, 'vlc'), '3.0.21');
    expect(makeService().getState()).toEqual({
      vlcPresent: true,
      installedVersion: '3.0.21',
      pendingVersion: null,
    });
  });

  it('check : mise à jour proposée seulement si plus récente', async () => {
    makeVlcDir(path.join(toolsDir, 'vlc'), '3.0.21');
    expect(await makeService().check()).toEqual({ status: 'update', latestVersion: '9.9.9' });

    fs.writeFileSync(path.join(toolsDir, 'vlc', '.version'), '9.9.9', 'utf8');
    expect((await makeService().check()).status).toBe('upToDate');
  });

  it('check hors ligne -> offline (jamais d exception)', async () => {
    const offline = (async () => {
      throw new Error('réseau coupé');
    }) as typeof fetch;
    expect((await makeService(offline).check()).status).toBe('offline');
  });
});

describe('VlcUpdaterService.download / applyPendingUpdate', () => {
  it('télécharge en staging vlc-next avec marqueur, sans toucher à vlc', async () => {
    makeVlcDir(path.join(toolsDir, 'vlc'), '3.0.21');
    expect(await makeService().download()).toBe('ok');

    const state = makeService().getState();
    expect(state.installedVersion).toBe('3.0.21'); // l'actuelle est intacte
    expect(state.pendingVersion).toBe('9.9.9');
    expect(fs.existsSync(path.join(toolsDir, 'vlc-next', 'vlc.exe'))).toBe(true);
  });

  it('bascule au démarrage : nouvelle en place, ancienne en secours', async () => {
    makeVlcDir(path.join(toolsDir, 'vlc'), '3.0.21');
    await makeService().download();

    makeService().applyPendingUpdate();

    const state = makeService().getState();
    expect(state.installedVersion).toBe('9.9.9');
    expect(state.pendingVersion).toBeNull();
    // Secours : l'ancienne version attend dans vlc-prev.
    expect(fs.readFileSync(path.join(toolsDir, 'vlc-prev', '.version'), 'utf8')).toBe('3.0.21');
  });

  it('applyPendingUpdate sans staging : ne touche à rien', () => {
    makeVlcDir(path.join(toolsDir, 'vlc'), '3.0.21');
    makeService().applyPendingUpdate();
    expect(makeService().getState().installedVersion).toBe('3.0.21');
    expect(fs.existsSync(path.join(toolsDir, 'vlc-prev'))).toBe(false);
  });

  it('zip sans vlc.exe -> error, aucun staging déposé', async () => {
    makeVlcDir(path.join(toolsDir, 'vlc'), '3.0.21');
    const badUnzip = (_zip: string, destDir: string): void => {
      fs.mkdirSync(path.join(destDir, 'vlc-9.9.9'), { recursive: true }); // vide !
    };
    const service = new VlcUpdaterService({
      fetchFn: fakeFetch,
      toolsDir: () => toolsDir,
      unzipFn: badUnzip,
    });
    expect(await service.download()).toBe('error');
    expect(fs.existsSync(path.join(toolsDir, 'vlc-next'))).toBe(false);
  });
});
