/**
 * Batterie de tests du parsing des noms de fichiers — cas réels, y compris
 * pièges français et titres contenant des années.
 */
import { describe, expect, it } from 'vitest';

import { parseFilename } from './filename.service';

describe('parseFilename — cas nominaux', () => {
  it('nom de release scène classique', () => {
    expect(parseFilename('Prometheus.2012.1080p.BluRay.x264-GRP.mkv')).toEqual({
      title: 'Prometheus',
      year: 2012,
      partNumber: null,
      looksLikeEpisode: false,
    });
  });

  it('titre avec année entre parenthèses', () => {
    const parsed = parseFilename('Blade Runner 2049 (2017) [1080p].mkv');
    expect(parsed.title).toBe('Blade Runner 2049');
    expect(parsed.year).toBe(2017);
  });

  it('nom simple sans jargon', () => {
    const parsed = parseFilename('The.Matrix.1999.mkv');
    expect(parsed.title).toBe('The Matrix');
    expect(parsed.year).toBe(1999);
  });

  it('gros nom UHD moderne', () => {
    const parsed = parseFilename(
      'Interstellar.2014.2160p.UHD.BluRay.x265.HDR.Atmos.mkv',
    );
    expect(parsed.title).toBe('Interstellar');
    expect(parsed.year).toBe(2014);
  });

  it('chemin complet : seul le nom de fichier compte', () => {
    const parsed = parseFilename('E:\\Films\\Alien (1979)\\Alien.1979.mkv');
    expect(parsed.title).toBe('Alien');
    expect(parsed.year).toBe(1979);
  });
});

describe('parseFilename — pièges d années dans les titres', () => {
  it('titre commençant par une année + année de sortie ailleurs', () => {
    const parsed = parseFilename('2001.A.Space.Odyssey.1968.720p.mkv');
    expect(parsed.title).toBe('2001 A Space Odyssey');
    expect(parsed.year).toBe(1968);
  });

  it('titre qui EST une année, sans année de sortie', () => {
    const parsed = parseFilename('1917.mkv');
    expect(parsed.title).toBe('1917');
    expect(parsed.year).toBeNull();
  });
});

describe('parseFilename — cas français', () => {
  it('release française avec mentions de langue', () => {
    const parsed = parseFilename('Le.Nom.De.La.Rose.1986.FRENCH.DVDRip.mkv');
    expect(parsed.title).toBe('Le Nom De La Rose');
    expect(parsed.year).toBe(1986);
  });

  it('MULTI/VOSTFR retirés sans couper le titre', () => {
    const parsed = parseFilename('Parasite.MULTI.VOSTFR.2019.1080p.mkv');
    expect(parsed.title).toBe('Parasite');
    expect(parsed.year).toBe(2019);
  });

  it('accents préservés', () => {
    const parsed = parseFilename('Le Fabuleux Destin d’Amélie Poulain.mp4');
    expect(parsed.title).toBe('Le Fabuleux Destin d’Amélie Poulain');
    expect(parsed.year).toBeNull();
  });
});

describe('parseFilename — multi-parties et séries', () => {
  it('détecte CD1/CD2', () => {
    expect(parseFilename('Avatar.CD1.avi').partNumber).toBe(1);
    expect(parseFilename('Avatar.CD2.avi').partNumber).toBe(2);
    expect(parseFilename('Avatar.CD1.avi').title).toBe('Avatar');
  });

  it('détecte part / disc', () => {
    expect(parseFilename('Titanic.part2.mkv').partNumber).toBe(2);
    expect(parseFilename('Titanic.disc 1.mkv').partNumber).toBe(1);
  });

  it('signale les épisodes de série (S01E02 et 1x05)', () => {
    expect(parseFilename('Breaking.Bad.S01E02.720p.mkv').looksLikeEpisode).toBe(true);
    expect(parseFilename('Better.Call.Saul.1x05.mkv').looksLikeEpisode).toBe(true);
    expect(parseFilename('Prometheus.2012.mkv').looksLikeEpisode).toBe(false);
  });

  it('ne confond pas un titre contenant un tiret avec du jargon', () => {
    expect(parseFilename('Spider-Man.2002.mkv').title).toBe('Spider-Man');
  });
});
