/**
 * Tests du service `.nfo` : aller-retour complet, tolérance aux fichiers
 * d'autres outils (Kodi/Jellyfin), écriture atomique sur disque réel.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  MovieNfo,
  buildMovieNfoXml,
  nfoPathForVideo,
  parseMovieNfoXml,
  readMovieNfoFor,
  writeMovieNfo,
} from './nfo.service';

/** Fiche complète de référence pour les tests d'aller-retour. */
const FULL_NFO: MovieNfo = {
  titleVo: 'Prometheus',
  titleVf: 'Prometheus (VF)',
  year: 2012,
  overview: 'Une expédition scientifique aux confins de l’univers.',
  personalRating: 8,
  personalNotes: 'Vu au cinéma — le prologue est somptueux.',
  tmdbRating: 7.9,
  tmdbId: 70981,
  trailerYoutubeKey: 'dQw4w9WgXcQ',
  directors: ['Ridley Scott'],
  writers: ['Jon Spaihts', 'Damon Lindelof'],
  actors: [
    { name: 'Noomi Rapace', character: 'Elizabeth Shaw' },
    { name: 'Michael Fassbender', character: 'David' },
  ],
  genres: ['Science-Fiction', 'Horreur'],
  tags: ['alien', 'space'],
};

describe('nfoPathForVideo', () => {
  it('remplace l extension par .nfo dans le même dossier', () => {
    expect(nfoPathForVideo('E:\\Films\\Alien (1979)\\alien.mkv')).toBe(
      'E:\\Films\\Alien (1979)\\alien.nfo',
    );
  });
});

describe('aller-retour build -> parse', () => {
  it('restitue une fiche complète à l identique', () => {
    const xml = buildMovieNfoXml(FULL_NFO);
    expect(parseMovieNfoXml(xml)).toEqual(FULL_NFO);
  });

  it('restitue une fiche minimale (titre VO seul)', () => {
    const minimal: MovieNfo = {
      titleVo: '1917', // titre numérique : doit rester une CHAÎNE
      titleVf: null,
      year: null,
      overview: null,
      personalRating: null,
      personalNotes: null,
      tmdbRating: null,
      tmdbId: null,
      trailerYoutubeKey: null,
      directors: [],
      writers: [],
      actors: [],
      genres: [],
      tags: [],
    };
    const xml = buildMovieNfoXml(minimal);
    expect(parseMovieNfoXml(xml)).toEqual(minimal);
    // Pas de balises vides parasites pour les champs absents.
    expect(xml).not.toContain('<plot>');
    expect(xml).not.toContain('<genre>');
  });
});

describe('Unicode — titres non latins (japonais, cyrillique…)', () => {
  it('fait l aller-retour sans perte, quel que soit l alphabet', () => {
    const unicode: MovieNfo = {
      titleVo: '千と千尋の神隠し', // vrai titre original japonais
      titleVf: 'Le Voyage de Chihiro',
      year: 2001,
      overview: 'Хроника одного путешествия — приключение Тихиро.',
      personalRating: null,
      personalNotes: null,
      tmdbRating: null,
      tmdbId: 129,
      trailerYoutubeKey: null,
      directors: ['宮崎駿'],
      writers: [],
      actors: [{ name: 'Руми Хиираги', character: '千尋' }],
      genres: ['アニメ'],
      tags: [],
    };
    expect(parseMovieNfoXml(buildMovieNfoXml(unicode))).toEqual(unicode);
  });
});

describe('tolérance aux .nfo d autres outils', () => {
  it('lit un nfo « façon Kodi » avec balises inconnues et genre unique', () => {
    const kodiXml = `<?xml version="1.0" encoding="UTF-8"?>
      <movie>
        <title>Alien, le huitième passager</title>
        <originaltitle>Alien</originaltitle>
        <sorttitle>Alien 01</sorttitle>
        <year>1979</year>
        <mpaa>FR:12</mpaa>
        <genre>Science-Fiction</genre>
        <uniqueid type="imdb">tt0078748</uniqueid>
        <uniqueid type="tmdb" default="true">348</uniqueid>
        <director>Ridley Scott</director>
        <actor><name>Sigourney Weaver</name><role>Ripley</role><thumb>x.jpg</thumb></actor>
        <fileinfo><streamdetails><video><codec>h264</codec></video></streamdetails></fileinfo>
      </movie>`;

    const parsed = parseMovieNfoXml(kodiXml);
    expect(parsed).not.toBeNull();
    expect(parsed?.titleVo).toBe('Alien');
    expect(parsed?.titleVf).toBe('Alien, le huitième passager');
    expect(parsed?.year).toBe(1979);
    expect(parsed?.tmdbId).toBe(348); // le uniqueid imdb est ignoré
    expect(parsed?.genres).toEqual(['Science-Fiction']); // valeur unique -> tableau
    expect(parsed?.actors).toEqual([{ name: 'Sigourney Weaver', character: 'Ripley' }]);
  });

  it('extrait la clé YouTube des différents formats de <trailer>', () => {
    const withUrl = `<movie><title>X</title>
      <trailer>https://www.youtube.com/watch?v=AbC123xyz_-</trailer></movie>`;
    expect(parseMovieNfoXml(withUrl)?.trailerYoutubeKey).toBe('AbC123xyz_-');

    const withShort = `<movie><title>X</title>
      <trailer>https://youtu.be/AbC123xyz_-</trailer></movie>`;
    expect(parseMovieNfoXml(withShort)?.trailerYoutubeKey).toBe('AbC123xyz_-');

    const withLocalFile = `<movie><title>X</title>
      <trailer>trailers/x-trailer.mp4</trailer></movie>`;
    expect(parseMovieNfoXml(withLocalFile)?.trailerYoutubeKey).toBeNull();
  });

  it('retourne null pour un XML illisible ou une racine non-movie', () => {
    expect(parseMovieNfoXml('pas du xml <movie>')).toBeNull();
    expect(parseMovieNfoXml('<episodedetails><title>S01E01</title></episodedetails>')).toBeNull();
    expect(parseMovieNfoXml('<movie><year>1999</year></movie>')).toBeNull(); // sans titre
  });
});

describe('écriture / lecture disque', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm0v13s-nfo-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('écrit atomiquement à côté de la vidéo puis relit la même fiche', async () => {
    const videoPath = path.join(tmpDir, 'Prometheus.2012.mkv');
    const nfoPath = await writeMovieNfo(videoPath, FULL_NFO);

    expect(nfoPath).toBe(path.join(tmpDir, 'Prometheus.2012.nfo'));
    expect(fs.existsSync(nfoPath)).toBe(true);
    // Aucun fichier temporaire ne doit survivre à l'écriture.
    expect(fs.readdirSync(tmpDir).filter((f) => f.endsWith('.tmp'))).toEqual([]);

    expect(await readMovieNfoFor(videoPath)).toEqual(FULL_NFO);
  });

  it('readMovieNfoFor retourne null si le .nfo est absent', async () => {
    expect(await readMovieNfoFor(path.join(tmpDir, 'sans-nfo.mkv'))).toBeNull();
  });
});
