/**
 * Logique PURE du cache de miniatures (sans Electron ni fs — testable
 * directement sous Vitest). Le redimensionnement lui-même vit dans
 * thumbs.service.ts (nativeImage, disponible seulement dans le main).
 *
 * Pourquoi un cache : le browse affiche des dizaines d'affiches à la fois
 * depuis un disque dur externe potentiellement lent — servir les JPEG
 * pleine taille (500 Ko - 2 Mo pièce) rendrait les rangées poussives. Les
 * miniatures (~20 Ko) vivent dans `data\thumbs` : un cache local
 * RECONSTRUCTIBLE, jamais indispensable (principe n° 2 : seuls les
 * sidecars voyagent avec les films).
 */
import crypto from 'node:crypto';

/**
 * Largeur cible des miniatures (px) — calée sur le `w342` de TMDB :
 * suffisant pour une carte de rangée, même sur écran haute densité.
 */
export const THUMB_WIDTH = 342;

/**
 * Nom du fichier de cache d'une image source.
 *
 * Le hash couvre le chemin relatif ET le mtime : si l'affiche est
 * remplacée (ré-enrichissement TMDB), son mtime change → nouveau nom →
 * régénération automatique, sans logique d'invalidation. Contrepartie
 * assumée : l'ancienne miniature devient orpheline dans `data\thumbs`
 * (dossier reconstructible, purgeable — polish possible en phase 5).
 *
 * @param relPath chemin de l'image relatif à la racine du lecteur
 * @param mtimeMs mtime de l'image source (ms epoch)
 */
export function thumbFileName(relPath: string, mtimeMs: number): string {
  const hash = crypto.createHash('sha1').update(`${relPath}|${mtimeMs}`).digest('hex');
  return `${hash}.jpg`;
}
