/**
 * Génération des miniatures d'affiches (cache local `data\thumbs`).
 *
 * Utilise `nativeImage` d'Electron : décodage/redimensionnement JPEG/PNG
 * intégrés au runtime — AUCUNE dépendance native supplémentaire à
 * rebuilder (exigence de portabilité, cf. le piège better-sqlite3).
 *
 * Consommé par le protocole `m0v13s-img://thumb/…` (main.ts) : la
 * miniature est générée à la première demande puis servie depuis le
 * cache. Tout échec est silencieux — l'appelant sert l'image originale.
 */
import { nativeImage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

import { THUMB_WIDTH, thumbFileName } from './thumbs.logic';

export class ThumbsService {
  /** @param thumbsDir dossier du cache (créé au besoin) — `data\thumbs`. */
  constructor(private readonly thumbsDir: string) {}

  /**
   * Garantit la miniature d'une image et retourne son chemin absolu.
   * @param absImagePath chemin absolu de l'image source (déjà validé
   *        comme relatif au lecteur par l'appelant)
   * @param relPath     chemin relatif de la même image (clé de cache)
   * @returns le chemin de la miniature, ou null si la source est
   *          illisible/absente — l'appelant sert alors l'original.
   */
  async ensureThumb(absImagePath: string, relPath: string): Promise<string | null> {
    try {
      // Le mtime fait partie du nom de cache : affiche remplacée →
      // régénération automatique (voir thumbs.logic.ts).
      const stat = await fs.stat(absImagePath);
      const thumbPath = path.join(this.thumbsDir, thumbFileName(relPath, stat.mtimeMs));

      // Déjà en cache → rien à faire.
      try {
        await fs.access(thumbPath);
        return thumbPath;
      } catch {
        // Absente : on la génère ci-dessous.
      }

      const image = nativeImage.createFromPath(absImagePath);
      if (image.isEmpty()) {
        return null; // fichier corrompu ou format non décodable
      }
      // Jamais d'agrandissement : une source déjà petite reste telle quelle.
      const resized =
        image.getSize().width > THUMB_WIDTH ? image.resize({ width: THUMB_WIDTH }) : image;

      // Écriture ATOMIQUE (tmp + rename, règle CLAUDE.md) : deux requêtes
      // simultanées écrivent chacune leur tmp, le dernier rename gagne.
      await fs.mkdir(this.thumbsDir, { recursive: true });
      const tmpPath = `${thumbPath}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(tmpPath, resized.toJPEG(82));
      await fs.rename(tmpPath, thumbPath);
      return thumbPath;
    } catch {
      return null; // source disparue, disque débranché… → repli original
    }
  }
}
