/**
 * Regroupement des fichiers d'un film dans SON dossier — logique PURE
 * (testée dans grouping.logic.spec.ts ; les opérations fs vivent dans
 * scanner.service).
 *
 * Décision utilisateur (phase 2) : à l'ENREGISTREMENT d'une fiche
 * (assistant de scan, « Compléter via TMDB », édition manuelle), un
 * fichier posé directement dans une racine de bibliothèque (« hors
 * dossier ») est déplacé dans un dossier à son nom, avec tous ses
 * sidecars (.nfo, images — et fichiers futurs). Convention Kodi :
 * `Titre VO (Année)`.
 */
import path from 'node:path';

/** Caractères interdits dans un nom de dossier Windows. */
const FORBIDDEN_CHARS = /[<>:"/\\|?*]/g;

/**
 * Assainit un titre pour en faire un nom de dossier valide (Windows) :
 * caractères interdits remplacés, points/espaces de fin retirés.
 */
export function sanitizeFolderName(name: string): string {
  const clean = name.replace(FORBIDDEN_CHARS, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  return clean === '' ? 'Film' : clean;
}

/** Nom du dossier d'un film : `Titre VO (Année)`, ou titre seul sans année. */
export function movieFolderName(titleVo: string, year: number | null): string {
  const base = sanitizeFolderName(titleVo);
  return year === null ? base : `${base} (${year})`;
}

/** Dossier parent d'un chemin relatif normalisé (séparateurs `/`), '' si racine. */
export function parentDirOf(relPath: string): string {
  const parent = path.posix.dirname(relPath);
  return parent === '.' ? '' : parent;
}

/**
 * Vrai si le fichier est « hors dossier » : posé DIRECTEMENT dans une
 * racine de bibliothèque (il sera regroupé à l'enregistrement). Un
 * fichier déjà dans un sous-dossier est considéré comme rangé.
 */
export function isLooseFile(relPath: string, libraryRoots: string[]): boolean {
  const parent = parentDirOf(relPath);
  return libraryRoots.some((root) => root.replace(/\/+$/, '') === parent);
}
