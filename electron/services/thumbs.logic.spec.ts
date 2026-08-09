/**
 * Tests de la logique pure du cache de miniatures.
 * (Le redimensionnement nativeImage vit dans thumbs.service.ts et exige le
 * runtime Electron — il est volontairement mince et couvert par le repli
 * « original » du protocole en cas d'échec.)
 */
import { describe, expect, it } from 'vitest';

import { THUMB_WIDTH, thumbFileName } from './thumbs.logic';

describe('thumbFileName', () => {
  it('est stable pour une même source (même chemin + même mtime)', () => {
    expect(thumbFileName('Films/Alien (1979)/alien-poster.jpg', 123456)).toBe(
      thumbFileName('Films/Alien (1979)/alien-poster.jpg', 123456),
    );
  });

  it('change quand l affiche est remplacée (mtime différent)', () => {
    const before = thumbFileName('Films/Alien (1979)/alien-poster.jpg', 1);
    const after = thumbFileName('Films/Alien (1979)/alien-poster.jpg', 2);
    expect(after).not.toBe(before);
  });

  it('change d une image à l autre (chemins différents)', () => {
    expect(thumbFileName('a-poster.jpg', 1)).not.toBe(thumbFileName('b-poster.jpg', 1));
  });

  it('produit un nom de fichier plat en .jpg (aucun séparateur)', () => {
    const name = thumbFileName('Films/Été (2020)/été-poster.jpg', 42);
    expect(name).toMatch(/^[0-9a-f]{40}\.jpg$/);
  });

  it('expose une largeur cible raisonnable pour des cartes', () => {
    expect(THUMB_WIDTH).toBeGreaterThanOrEqual(200);
    expect(THUMB_WIDTH).toBeLessThanOrEqual(500);
  });
});
