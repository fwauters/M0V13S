/**
 * Logique PURE de la mise à jour de VLC (PLAN § 6.7) — parsing de
 * l'index officiel VideoLAN et comparaison de versions, testables sans
 * réseau ni fs. Le service (vlc-updater.service.ts) orchestre
 * téléchargement, staging et bascule.
 */

/** Répertoire officiel des builds VLC win64 (« last » = dernière stable). */
export const VLC_LIST_URL = 'https://get.videolan.org/vlc/last/win64/';

/** Une version publiée trouvée dans l'index (zip win64). */
export interface VlcRelease {
  /** Version « 3.0.21 ». */
  version: string;
  /** Nom du zip (« vlc-3.0.21-win64.zip »). */
  zipName: string;
}

/**
 * Extrait la dernière version win64 de l'index HTML de videolan.org.
 * @returns null si le format de la page a changé (l'appelant remontera
 *          une erreur douce — jamais de plantage).
 */
export function parseVlcListing(html: string): VlcRelease | null {
  const match = /href="(vlc-([\d.]+)-win64\.zip)"/.exec(html);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    return null;
  }
  return { zipName: match[1], version: match[2] };
}

/**
 * Compare deux versions numériques à points (« 3.0.9 » vs « 3.0.21 »).
 * @returns négatif si a < b, 0 si égales, positif si a > b
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const partsB = b.split('.').map((p) => Number.parseInt(p, 10) || 0);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/**
 * Une mise à jour vaut-elle le coup ?
 * Version installée inconnue (marqueur absent : VLC déposé à la main ou
 * par un vieux prepare-tools) → oui dès qu'une version publiée existe.
 */
export function isUpdateWorthwhile(installed: string | null, latest: string): boolean {
  return installed === null || compareVersions(latest, installed) > 0;
}
