/**
 * Images en SIDECARS — convention Kodi (PLAN § 3) : l'affiche et le fanart
 * vivent À CÔTÉ de la vidéo (`<nom>-poster.jpg`, `<nom>-fanart.jpg`), pas
 * dans data\. Un dossier de film est ainsi AUTONOME et partageable : copié
 * ailleurs, il emporte fiche (.nfo) et images — réimportables hors ligne.
 *
 * Deux sources :
 * - détection d'images DÉJÀ présentes (dossier partagé, re-scan) — fs
 *   uniquement, aucun réseau ;
 * - téléchargement TMDB à la qualification (en ligne), écriture ATOMIQUE
 *   (tmp + rename), échec silencieux (l'image n'est qu'un bonus visuel).
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/** Base des images TMDB (poster en w780, fanart en w1280 — bon compromis
 *  qualité/poids pour un affichage desktop). */
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/** Délai maximal d'un téléchargement d'image. */
const DOWNLOAD_TIMEOUT_MS = 20_000;

/** Chemins absolus des images sidecar trouvées/écrites (null = absente). */
export interface MovieImages {
  poster: string | null;
  fanart: string | null;
}

/** Chemin du sidecar d'affiche d'une vidéo (`…\film-poster.jpg`). */
export function posterPathForVideo(videoPath: string): string {
  const ext = path.extname(videoPath);
  return videoPath.slice(0, videoPath.length - ext.length) + '-poster.jpg';
}

/** Chemin du sidecar de fanart d'une vidéo (`…\film-fanart.jpg`). */
export function fanartPathForVideo(videoPath: string): string {
  const ext = path.extname(videoPath);
  return videoPath.slice(0, videoPath.length - ext.length) + '-fanart.jpg';
}

/** Détecte les images sidecar déjà présentes à côté d'une vidéo (fs seul). */
export function findExistingImages(videoAbsPath: string): MovieImages {
  const poster = posterPathForVideo(videoAbsPath);
  const fanart = fanartPathForVideo(videoAbsPath);
  return {
    poster: fs.existsSync(poster) ? poster : null,
    fanart: fs.existsSync(fanart) ? fanart : null,
  };
}

/** Télécharge une image vers `destPath` (atomique). Vrai si réussie. */
async function downloadImage(
  url: string,
  destPath: string,
  fetchFn: typeof fetch,
): Promise<boolean> {
  try {
    const response = await fetchFn(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) {
      return false;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const tmpPath = `${destPath}.tmp`;
    await fsp.writeFile(tmpPath, bytes);
    await fsp.rename(tmpPath, destPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Assure les images sidecar d'une vidéo :
 * - si des chemins TMDB sont fournis (fiche appliquée dans l'assistant),
 *   tente le téléchargement (rafraîchit une image existante) ;
 * - sinon — ou en cas d'échec réseau — retombe sur les images déjà
 *   présentes sur le disque.
 * Ne lève JAMAIS : les images sont un bonus, pas une condition.
 */
export async function ensureMovieImages(
  videoAbsPath: string,
  tmdbPosterPath: string | null,
  tmdbBackdropPath: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<MovieImages> {
  const posterDest = posterPathForVideo(videoAbsPath);
  const fanartDest = fanartPathForVideo(videoAbsPath);

  if (tmdbPosterPath !== null) {
    await downloadImage(`${TMDB_IMAGE_BASE}/w780${tmdbPosterPath}`, posterDest, fetchFn);
  }
  if (tmdbBackdropPath !== null) {
    await downloadImage(`${TMDB_IMAGE_BASE}/w1280${tmdbBackdropPath}`, fanartDest, fetchFn);
  }

  // Le résultat reflète l'état RÉEL du disque (téléchargé ou préexistant).
  return findExistingImages(videoAbsPath);
}
