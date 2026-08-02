/**
 * Test de COMPLÉTUDE des traductions (règle CLAUDE.md / PLAN § 6.6).
 * Les jeux de clés de tous les fichiers ui/src/assets/i18n/*.json doivent
 * être STRICTEMENT identiques : une clé manquante ou orpheline dans une
 * langue fait échouer ce test. Conçu pour accueillir les langues futures :
 * ajouter un JSON incomplet casse la suite tant qu'il n'est pas aligné.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** Dossier des traductions, relatif à la racine du repo. */
const I18N_DIR = path.resolve(__dirname, '../ui/src/assets/i18n');

/** Aplati un objet JSON en liste de clés pointées (ex. `home.pingButton`). */
function flattenKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix === '' ? key : `${prefix}.${key}`),
  );
}

/** Charge toutes les langues : { fr: [clés...], en: [clés...], ... }. */
function loadAllKeySets(): Map<string, Set<string>> {
  const files = fs.readdirSync(I18N_DIR).filter((f) => f.endsWith('.json'));
  const sets = new Map<string, Set<string>>();
  for (const file of files) {
    const raw = fs.readFileSync(path.join(I18N_DIR, file), 'utf8');
    sets.set(file, new Set(flattenKeys(JSON.parse(raw)).sort()));
  }
  return sets;
}

describe('complétude i18n', () => {
  it('au moins deux langues sont présentes (fr, en)', () => {
    const sets = loadAllKeySets();
    expect([...sets.keys()]).toEqual(expect.arrayContaining(['fr.json', 'en.json']));
  });

  it('toutes les langues exposent exactement les mêmes clés', () => {
    const sets = loadAllKeySets();
    const [reference, ...others] = [...sets.entries()];
    if (!reference) {
      throw new Error(`Aucun fichier de traduction trouvé dans ${I18N_DIR}`);
    }
    const [refFile, refKeys] = reference;

    for (const [file, keys] of others) {
      const missing = [...refKeys].filter((k) => !keys.has(k));
      const orphan = [...keys].filter((k) => !refKeys.has(k));
      expect
        .soft(missing, `clés de ${refFile} absentes de ${file}`)
        .toEqual([]);
      expect
        .soft(orphan, `clés de ${file} absentes de ${refFile}`)
        .toEqual([]);
    }
  });
});
