/**
 * Tests du service TMDB (partie clé API) — fetch MOCKÉ, aucun réseau.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppDatabaseHandle, openDatabase } from '../db/client';
import { SettingsService } from './settings.service';
import { TmdbService, maskApiKey } from './tmdb.service';

const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');

let tmpDir: string;
let handle: AppDatabaseHandle;
let settings: SettingsService;

/** Fabrique un double de fetch qui répond avec le statut HTTP donné. */
function fetchRespondingWith(status: number): typeof fetch {
  return async () => new Response('{}', { status });
}

/** Double de fetch qui simule une panne réseau (hors ligne). */
const fetchOffline: typeof fetch = async () => {
  throw new TypeError('fetch failed');
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm0v13s-tmdb-test-'));
  handle = openDatabase(path.join(tmpDir, 'library.db'), MIGRATIONS_DIR);
  settings = new SettingsService(handle.db);
});

afterEach(() => {
  handle.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('maskApiKey', () => {
  it('ne révèle que les 4 derniers caractères', () => {
    expect(maskApiKey('abcdef1234567890')).toBe('****7890');
  });

  it('voile entièrement une clé trop courte', () => {
    expect(maskApiKey('abc')).toBe('****');
  });
});

describe('TmdbService — statut et stockage de la clé', () => {
  it('statut « non configurée » sans clé, puis masqué après enregistrement', () => {
    const service = new TmdbService(settings, fetchOffline);
    expect(service.getKeyStatus()).toEqual({ configured: false, maskedKey: null });

    service.setKey('  abcdef1234567890  '); // espaces parasites tolérés
    expect(service.getKeyStatus()).toEqual({ configured: true, maskedKey: '****7890' });
  });

  it('une clé vide efface la configuration', () => {
    const service = new TmdbService(settings, fetchOffline);
    service.setKey('abcdef1234567890');
    service.setKey('');
    expect(service.getKeyStatus()).toEqual({ configured: false, maskedKey: null });
  });
});

describe('TmdbService.testKey', () => {
  it('valid quand TMDB répond 200', async () => {
    const service = new TmdbService(settings, fetchRespondingWith(200));
    service.setKey('bonne-cle');
    expect(await service.testKey()).toBe('valid');
  });

  it('invalid quand TMDB répond 401', async () => {
    const service = new TmdbService(settings, fetchRespondingWith(401));
    service.setKey('mauvaise-cle');
    expect(await service.testKey()).toBe('invalid');
  });

  it('invalid sans clé stockée ni candidate (rien à tester)', async () => {
    const service = new TmdbService(settings, fetchRespondingWith(200));
    expect(await service.testKey()).toBe('invalid');
  });

  it('offline quand le réseau est indisponible (clé conservée)', async () => {
    const service = new TmdbService(settings, fetchOffline);
    service.setKey('cle-saisie-hors-ligne');
    expect(await service.testKey()).toBe('offline');
    expect(service.getKeyStatus().configured).toBe(true);
  });

  it('teste une clé CANDIDATE sans toucher à la clé stockée', async () => {
    const service = new TmdbService(settings, fetchRespondingWith(200));
    service.setKey('cle-stockee');
    expect(await service.testKey('candidate')).toBe('valid');
    expect(service.getKeyStatus().maskedKey).toBe('****ckee');
  });
});
