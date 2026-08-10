/**
 * Tests du verrou admin : aller-retour scrypt, refus des mauvais mots de
 * passe, règles de définition/remplacement.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppDatabaseHandle, openDatabase } from '../db/client';
import { AdminService, hashPassword, verifyPassword } from './admin.service';
import { SettingsService } from './settings.service';

const MIGRATIONS_DIR = path.resolve(__dirname, '../db/migrations');

let tmpDir: string;
let handle: AppDatabaseHandle;
let service: AdminService;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm0v13s-admin-test-'));
  handle = openDatabase(path.join(tmpDir, 'library.db'), MIGRATIONS_DIR);
  service = new AdminService(new SettingsService(handle.db));
});

afterEach(() => {
  handle.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('hashPassword / verifyPassword', () => {
  it('fait l aller-retour et refuse un mauvais mot de passe', () => {
    const stored = hashPassword('s3cret!');
    expect(verifyPassword('s3cret!', stored)).toBe(true);
    expect(verifyPassword('autre', stored)).toBe(false);
  });

  it('deux hashs du même mot de passe diffèrent (sel aléatoire)', () => {
    expect(hashPassword('x')).not.toBe(hashPassword('x'));
  });

  it('hash corrompu → refus silencieux, jamais d exception', () => {
    expect(verifyPassword('x', 'pas-un-hash')).toBe(false);
    expect(verifyPassword('x', ':')).toBe(false);
    expect(verifyPassword('x', 'sel:zz-hex-invalide')).toBe(false);
  });
});

describe('AdminService', () => {
  it('sans mot de passe défini : verify passe (app pas encore configurée)', () => {
    expect(service.hasPassword()).toBe(false);
    expect(service.verify('nimporte')).toBe(true);
  });

  it('création puis vérification', () => {
    expect(service.setPassword('s3cret!', null)).toBe(true);
    expect(service.hasPassword()).toBe(true);
    expect(service.verify('s3cret!')).toBe(true);
    expect(service.verify('faux')).toBe(false);
  });

  it('remplacement : exige le mot de passe actuel', () => {
    service.setPassword('ancien', null);
    expect(service.setPassword('nouveau', null)).toBe(false);
    expect(service.setPassword('nouveau', 'faux')).toBe(false);
    expect(service.setPassword('nouveau', 'ancien')).toBe(true);
    expect(service.verify('nouveau')).toBe(true);
  });

  it('refuse un nouveau mot de passe vide', () => {
    expect(service.setPassword('   ', null)).toBe(false);
  });
});
