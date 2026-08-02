/**
 * Résolution des chemins de l'application — wrapper Electron autour de la
 * logique pure de paths.logic.ts. TOUT accès disque de l'app passe par ici
 * (CLAUDE.md : un chemin absolu en DB est un bug).
 *
 * Deux modes :
 * - packagé : l'app vit sur le disque (externe) → tout est relatif à l'exe ;
 * - dev     : `data\` à la racine du repo (gitignoré).
 */
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import { driveRootOf, resolveDataDir, resolveDbPath } from './paths.logic';

/** Racine « installation » : dossier de l'exe en packagé, racine du repo en dev. */
export function getAppRoot(): string {
  if (app.isPackaged) {
    return path.dirname(process.execPath);
  }
  // En dev, ce fichier est bundlé dans dist-electron\ : la racine du repo
  // est un cran au-dessus.
  return path.resolve(__dirname, '..');
}

/** Dossier des données (créé au besoin) : DB, miniatures, réglages. */
export function getDataDir(): string {
  const dir = resolveDataDir(getAppRoot());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Chemin du fichier SQLite. */
export function getDbPath(): string {
  return resolveDbPath(getDataDir());
}

/**
 * Dossier des migrations Drizzle :
 * - packagé : copié dans resources\migrations par electron-builder
 *   (voir electron-builder.yml, extraResources) ;
 * - dev : le dossier source electron\db\migrations.
 */
export function getMigrationsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'migrations');
  }
  return path.resolve(__dirname, '../electron/db/migrations');
}

/** Racine du lecteur qui porte l'app — base de tous les chemins relatifs. */
export function getDriveRoot(): string {
  return driveRootOf(getAppRoot());
}

/** Dossier des binaires embarqués (`tools\` à côté de l'exe / du repo). */
export function getToolsDir(): string {
  return path.join(getAppRoot(), 'tools');
}

/** Chemin de ffprobe embarqué (déposé par le script prepare-tools). */
export function getFfprobePath(): string {
  return path.join(getToolsDir(), 'ffprobe.exe');
}

/** Chemin de VLC portable embarqué (lecture, phase 4). */
export function getVlcPath(): string {
  return path.join(getToolsDir(), 'vlc', 'vlc.exe');
}
