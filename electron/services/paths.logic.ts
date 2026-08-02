/**
 * Logique PURE de résolution des chemins — sans dépendance à Electron,
 * donc testable directement sous Vitest (voir paths.logic.spec.ts).
 * Le wrapper lié à Electron (app.isPackaged, execPath…) vit dans
 * paths.service.ts.
 *
 * Invariant de portabilité (PLAN § 2) : la lettre de lecteur change d'une
 * machine à l'autre — AUCUN chemin absolu ne doit être persisté. Tout chemin
 * stocké en DB ou dans un `.nfo` passe par toDriveRelative / fromDriveRelative.
 */
import path from 'node:path';

/** Dossier des données (DB, miniatures) : toujours `data\` sous la racine app. */
export function resolveDataDir(appRoot: string): string {
  return path.join(appRoot, 'data');
}

/** Chemin du fichier SQLite dans le dossier de données. */
export function resolveDbPath(dataDir: string): string {
  return path.join(dataDir, 'library.db');
}

/** Racine du lecteur qui contient `p` (ex. `E:\` pour `E:\M0V13S`). */
export function driveRootOf(p: string): string {
  return path.parse(path.resolve(p)).root;
}

/**
 * Convertit un chemin absolu en chemin relatif à la racine du lecteur,
 * normalisé en séparateurs `/` (stable, portable, comparable).
 * Lève si le chemin n'est pas sur ce lecteur : c'est un bug d'appelant —
 * on ne doit jamais indexer un fichier hors du disque de la bibliothèque.
 */
export function toDriveRelative(driveRoot: string, absolutePath: string): string {
  const resolved = path.resolve(absolutePath);
  const relative = path.relative(driveRoot, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(
      `Chemin hors du lecteur de la bibliothèque : ${absolutePath} (racine : ${driveRoot})`,
    );
  }
  return relative.split(path.sep).join('/');
}

/** Opération inverse : reconstruit le chemin absolu sur le lecteur courant. */
export function fromDriveRelative(driveRoot: string, relativePath: string): string {
  return path.join(driveRoot, ...relativePath.split('/'));
}
