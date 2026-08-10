/**
 * Tests de la logique pure de lecture VLC : parsing du statut HTTP,
 * seuils de complétion/reprise, arguments de lancement.
 */
import { describe, expect, it } from 'vitest';

import {
  authHeader,
  buildVlcArgs,
  isCompleted,
  parseVlcStatus,
  resumeToSave,
  statusUrl,
} from './vlc.logic';

describe('parseVlcStatus', () => {
  it('extrait état, position et durée d un statut typique', () => {
    const json = JSON.stringify({ state: 'playing', time: 1200, length: 7260, volume: 256 });
    expect(parseVlcStatus(json)).toEqual({ state: 'playing', timeSec: 1200, lengthSec: 7260 });
  });

  it('durée inconnue (length -1 ou 0) -> null', () => {
    expect(parseVlcStatus(JSON.stringify({ state: 'playing', time: 3, length: -1 }))).toEqual({
      state: 'playing',
      timeSec: 3,
      lengthSec: null,
    });
    expect(parseVlcStatus(JSON.stringify({ state: 'stopped', length: 0 }))?.lengthSec).toBeNull();
  });

  it('JSON illisible ou état inconnu -> null (tick ignoré)', () => {
    expect(parseVlcStatus('pas du json')).toBeNull();
    expect(parseVlcStatus(JSON.stringify({ state: 'buffering?' }))).toBeNull();
  });
});

describe('isCompleted / resumeToSave', () => {
  it('vu à partir de 90 % de la durée', () => {
    expect(isCompleted(90, 100)).toBe(true);
    expect(isCompleted(89, 100)).toBe(false);
    expect(isCompleted(50, null)).toBe(false); // durée inconnue : jamais vu auto
    expect(isCompleted(null, 100)).toBe(false);
  });

  it('reprise : position telle quelle entre 60 s et 90 %', () => {
    expect(resumeToSave(1200, 7260)).toBe(1200);
  });

  it('pas de reprise sous 60 s (on repartira du début)', () => {
    expect(resumeToSave(45, 7260)).toBeNull();
    expect(resumeToSave(null, 7260)).toBeNull();
  });

  it('pas de reprise une fois le film vu (> 90 %)', () => {
    expect(resumeToSave(7000, 7260)).toBeNull();
  });

  it('durée inconnue : la reprise reste possible (position seule)', () => {
    expect(resumeToSave(1200, null)).toBe(1200);
  });
});

describe('buildVlcArgs', () => {
  it('construit la ligne de commande complète avec reprise', () => {
    const args = buildVlcArgs('E:\\Films\\Alien (1979)\\alien.mkv', {
      port: 8123,
      password: 'secret',
      startTimeSec: 1200,
    });
    expect(args).toContain('--fullscreen');
    expect(args).toContain('--play-and-exit');
    expect(args).toContain('--no-one-instance'); // sinon un VLC déjà ouvert avale le fichier
    expect(args.join(' ')).toContain('--http-host 127.0.0.1'); // IPv4 explicite (règle maison)
    expect(args.join(' ')).toContain('--http-port 8123');
    expect(args.join(' ')).toContain('--start-time 1200');
    expect(args[args.length - 1]).toBe('E:\\Films\\Alien (1979)\\alien.mkv');
  });

  it('omet --start-time pour une lecture depuis le début', () => {
    const args = buildVlcArgs('film.mkv', { port: 1, password: 'x', startTimeSec: 0 });
    expect(args).not.toContain('--start-time');
  });
});

describe('statusUrl / authHeader', () => {
  it('cible l interface HTTP locale avec Basic auth sans utilisateur', () => {
    expect(statusUrl(8123)).toBe('http://127.0.0.1:8123/requests/status.json');
    expect(authHeader('pwd')).toBe(`Basic ${Buffer.from(':pwd').toString('base64')}`);
  });
});
