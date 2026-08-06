/**
 * Tests des images sidecar : chemins, détection fs, téléchargement mocké
 * (aucun réseau), écriture atomique, replis en cas d'échec.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ensureMovieImages,
  fanartPathForVideo,
  findExistingImages,
  posterPathForVideo,
} from './images.service';

let tmpDir: string;
let videoPath: string;

/** fetch mocké : répond 200 avec un contenu binaire reconnaissable. */
const fetchOk: typeof fetch = async (url) =>
  new Response(Buffer.from(`image:${String(url)}`), { status: 200 });

/** fetch mocké : panne réseau. */
const fetchFail: typeof fetch = async () => {
  throw new TypeError('fetch failed');
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm0v13s-images-test-'));
  videoPath = path.join(tmpDir, 'Alien (1979)', 'alien.mkv');
  fs.mkdirSync(path.dirname(videoPath), { recursive: true });
  fs.writeFileSync(videoPath, 'faux contenu vidéo');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('chemins des sidecars', () => {
  it('suivent la convention Kodi <nom>-poster.jpg / <nom>-fanart.jpg', () => {
    expect(posterPathForVideo('E:\\Films\\alien.mkv')).toBe('E:\\Films\\alien-poster.jpg');
    expect(fanartPathForVideo('E:\\Films\\alien.mkv')).toBe('E:\\Films\\alien-fanart.jpg');
  });
});

describe('findExistingImages', () => {
  it('détecte les images présentes, null sinon', () => {
    expect(findExistingImages(videoPath)).toEqual({ poster: null, fanart: null });

    fs.writeFileSync(posterPathForVideo(videoPath), 'affiche');
    const images = findExistingImages(videoPath);
    expect(images.poster).toBe(posterPathForVideo(videoPath));
    expect(images.fanart).toBeNull();
  });
});

describe('ensureMovieImages', () => {
  it('télécharge poster et fanart en sidecars (atomique, sans .tmp résiduel)', async () => {
    const images = await ensureMovieImages(videoPath, '/abc.jpg', '/fond.jpg', fetchOk);

    expect(images.poster).toBe(posterPathForVideo(videoPath));
    expect(images.fanart).toBe(fanartPathForVideo(videoPath));
    // La bonne taille TMDB est demandée pour chaque type d'image.
    expect(fs.readFileSync(images.poster!, 'utf8')).toContain('/w780/abc.jpg');
    expect(fs.readFileSync(images.fanart!, 'utf8')).toContain('/w1280/fond.jpg');
    const dir = path.dirname(videoPath);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('retombe sur les images existantes quand le réseau échoue', async () => {
    fs.writeFileSync(posterPathForVideo(videoPath), 'affiche préexistante');

    const images = await ensureMovieImages(videoPath, '/abc.jpg', '/fond.jpg', fetchFail);

    expect(images.poster).toBe(posterPathForVideo(videoPath));
    expect(fs.readFileSync(images.poster!, 'utf8')).toBe('affiche préexistante');
    expect(images.fanart).toBeNull();
  });

  it('sans chemins TMDB : détection seule, aucun téléchargement', async () => {
    const images = await ensureMovieImages(videoPath, null, null, fetchFail);
    expect(images).toEqual({ poster: null, fanart: null });
  });
});
