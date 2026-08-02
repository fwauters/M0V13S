/**
 * Tests du service de réglages sur DB temporaire.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppDatabaseHandle, openDatabase } from '../db/client';
import { SettingsService } from './settings.service';

const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');

let tmpDir: string;
let handle: AppDatabaseHandle;
let service: SettingsService;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm0v13s-settings-test-'));
  handle = openDatabase(path.join(tmpDir, 'library.db'), MIGRATIONS_DIR);
  service = new SettingsService(handle.db);
});

afterEach(() => {
  handle.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('SettingsService', () => {
  it('retourne null pour un réglage jamais écrit', () => {
    expect(service.get('ui.theme')).toBeNull();
  });

  it('écrit puis relit une valeur', () => {
    service.set('ui.theme', 'dark');
    expect(service.get('ui.theme')).toBe('dark');
  });

  it('remplace la valeur existante (upsert)', () => {
    service.set('ui.lang', 'fr');
    service.set('ui.lang', 'en');
    expect(service.get('ui.lang')).toBe('en');
  });

  it('fait l aller-retour JSON et retombe sur le défaut si corrompu', () => {
    service.setJson('library.roots', ['Films', 'Docus/Nature']);
    expect(service.getLibraryRoots()).toEqual(['Films', 'Docus/Nature']);

    service.set('library.roots', '{json invalide');
    expect(service.getLibraryRoots()).toEqual([]);
  });

  it('retourne [] par défaut pour les racines de bibliothèque', () => {
    expect(service.getLibraryRoots()).toEqual([]);
  });
});
