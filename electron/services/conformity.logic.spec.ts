/**
 * Tests de la logique pure de conformité (règle « présent ET reconnu »).
 */
import { describe, expect, it } from 'vitest';

import { diffLibrary } from './conformity.logic';

describe('diffLibrary', () => {
  it('classe présent/manquant/inconnu', () => {
    const diff = diffLibrary(
      ['Films/a.mkv', 'Films/b.mkv', 'Films/c.mkv'],
      ['Films/a.mkv', 'Films/c.mkv', 'Films/nouveau.mkv'],
    );
    expect(diff.presentKnown.sort()).toEqual(['Films/a.mkv', 'Films/c.mkv']);
    expect(diff.missingKnown).toEqual(['Films/b.mkv']);
    expect(diff.unknownPresent).toEqual(['Films/nouveau.mkv']);
  });

  it('index vide : tout est à qualifier (scan forcé)', () => {
    const diff = diffLibrary([], ['Films/a.mkv']);
    expect(diff.presentKnown).toEqual([]);
    expect(diff.unknownPresent).toEqual(['Films/a.mkv']);
  });

  it('disque vide : tout l index est manquant', () => {
    const diff = diffLibrary(['Films/a.mkv'], []);
    expect(diff.missingKnown).toEqual(['Films/a.mkv']);
    expect(diff.presentKnown).toEqual([]);
  });

  it('la comparaison est exacte (chemins sensibles au moindre écart)', () => {
    const diff = diffLibrary(['Films/A.mkv'], ['Films/a.mkv']);
    expect(diff.presentKnown).toEqual([]);
    expect(diff.missingKnown).toEqual(['Films/A.mkv']);
    expect(diff.unknownPresent).toEqual(['Films/a.mkv']);
  });
});
