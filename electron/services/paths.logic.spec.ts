/**
 * Tests de la logique pure de résolution des chemins.
 * C'est LE point sensible de la portabilité (PLAN § 2) : la lettre de
 * lecteur change d'une machine à l'autre, donc tout chemin persisté doit
 * être relatif à la racine du lecteur et rejouable ailleurs.
 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  driveRootOf,
  fromDriveRelative,
  isVideoFile,
  resolveDataDir,
  resolveDbPath,
  toDriveRelative,
} from './paths.logic';

describe('resolveDataDir / resolveDbPath', () => {
  it('place data\\ sous la racine app et library.db dans data\\', () => {
    const dataDir = resolveDataDir('E:\\M0V13S');
    expect(dataDir).toBe(path.join('E:\\M0V13S', 'data'));
    expect(resolveDbPath(dataDir)).toBe(path.join(dataDir, 'library.db'));
  });
});

describe('driveRootOf', () => {
  it('retourne la racine du lecteur Windows', () => {
    expect(driveRootOf('E:\\M0V13S\\M0V13S.exe')).toBe('E:\\');
  });
});

describe('toDriveRelative', () => {
  it('produit un chemin relatif à la racine, en séparateurs /', () => {
    expect(toDriveRelative('E:\\', 'E:\\Films\\Prometheus (2012)\\film.mkv')).toBe(
      'Films/Prometheus (2012)/film.mkv',
    );
  });

  it('refuse un chemin situé sur un autre lecteur (bug appelant)', () => {
    expect(() => toDriveRelative('E:\\', 'D:\\Films\\film.mkv')).toThrow(
      /hors du lecteur/,
    );
  });
});

describe('isVideoFile', () => {
  it('reconnaît les extensions vidéo, insensible à la casse', () => {
    expect(isVideoFile('E:\\Films\\alien.mkv')).toBe(true);
    expect(isVideoFile('E:\\Films\\ALIEN.MP4')).toBe(true);
    expect(isVideoFile('film.avi')).toBe(true);
  });

  it('rejette les fichiers non vidéo (sidecars, sous-titres, images)', () => {
    expect(isVideoFile('alien.nfo')).toBe(false);
    expect(isVideoFile('alien.srt')).toBe(false);
    expect(isVideoFile('alien-poster.jpg')).toBe(false);
    expect(isVideoFile('sans-extension')).toBe(false);
  });
});

describe('aller-retour toDriveRelative <-> fromDriveRelative', () => {
  it('reconstruit le même chemin sur le même lecteur', () => {
    const original = 'E:\\Films\\Alien (1979)\\alien.mkv';
    const relative = toDriveRelative('E:\\', original);
    expect(fromDriveRelative('E:\\', relative)).toBe(original);
  });

  it('rejoue le chemin relatif sur un AUTRE lecteur (scénario portabilité)', () => {
    const relative = 'Films/Alien (1979)/alien.mkv';
    expect(fromDriveRelative('D:\\', relative)).toBe(
      'D:\\Films\\Alien (1979)\\alien.mkv',
    );
  });
});
