/**
 * Logique PURE du scan de conformité (testée sans fs ni DB).
 * Règle d'affichage absolue (PLAN § 6.1) : n'apparaît que ce qui est
 * présent sur le disque ET reconnu par l'index.
 */

/** Résultat du rapprochement index <-> disque. */
export interface ConformityDiff {
  /** Connus de l'index ET présents sur le disque → affichables. */
  presentKnown: string[];
  /** Connus de l'index mais absents du disque → à marquer `missing`. */
  missingKnown: string[];
  /** Présents sur le disque mais inconnus → « à qualifier » (masqués). */
  unknownPresent: string[];
}

/**
 * Rapproche les chemins connus (index) des chemins trouvés (disque).
 * Comparaison par chemin relatif exact — c'est l'identité d'un fichier.
 */
export function diffLibrary(
  knownRelPaths: readonly string[],
  foundRelPaths: readonly string[],
): ConformityDiff {
  const known = new Set(knownRelPaths);
  const found = new Set(foundRelPaths);

  return {
    presentKnown: [...known].filter((p) => found.has(p)),
    missingKnown: [...known].filter((p) => !found.has(p)),
    unknownPresent: [...found].filter((p) => !known.has(p)),
  };
}
