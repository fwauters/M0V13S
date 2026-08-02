/**
 * Parcours des racines de bibliothèque : liste les fichiers vidéo présents
 * sur le disque (noms + tailles + mtime UNIQUEMENT — aucune lecture de
 * contenu, c'est ce qui rend le scan de conformité rapide même sur HDD).
 *
 * Utilisé par la conformité (lancement) ET le scanner (mode admin).
 */
import fs from 'node:fs';
import path from 'node:path';

import { fromDriveRelative, isVideoFile, toDriveRelative } from './paths.logic';

/** Un fichier vidéo trouvé sur le disque (identité minimale). */
export interface FoundFile {
  /** Chemin relatif à la racine du lecteur, séparateurs `/`. */
  relPath: string;
  sizeBytes: number;
  mtimeMs: number;
}

/**
 * Parcourt récursivement les racines et retourne tous les fichiers vidéo.
 * Tolérant : une racine absente ou illisible est ignorée (le disque a pu
 * être réorganisé — la conformité le constatera fichier par fichier).
 * @param driveRoot racine du lecteur (ex. `E:\`)
 * @param roots racines de bibliothèque, RELATIVES au lecteur
 */
export function walkLibraryRoots(driveRoot: string, roots: string[]): FoundFile[] {
  const found: FoundFile[] = [];
  for (const root of roots) {
    walkDir(driveRoot, fromDriveRelative(driveRoot, root), found);
  }
  return found;
}

/** Descente récursive d'un dossier (ignore silencieusement l'illisible). */
function walkDir(driveRoot: string, dir: string, out: FoundFile[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // dossier absent ou inaccessible : rien à lister ici
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(driveRoot, fullPath, out);
    } else if (entry.isFile() && isVideoFile(entry.name)) {
      try {
        const stat = fs.statSync(fullPath);
        out.push({
          relPath: toDriveRelative(driveRoot, fullPath),
          sizeBytes: stat.size,
          mtimeMs: Math.round(stat.mtimeMs),
        });
      } catch {
        // Fichier disparu entre readdir et stat : ignoré, le prochain
        // scan le reclassera.
      }
    }
  }
}
