/**
 * Tests de la logique pure de mise à jour VLC : parsing de l'index
 * videolan.org, comparaison de versions, opportunité de mise à jour.
 */
import { describe, expect, it } from 'vitest';

import { compareVersions, isUpdateWorthwhile, parseVlcListing } from './vlc-updater.logic';

describe('parseVlcListing', () => {
  it('extrait version et nom de zip de l index officiel', () => {
    const html = `<html><a href="vlc-3.0.21-win64.7z">7z</a>
      <a href="vlc-3.0.21-win64.zip">zip</a>
      <a href="vlc-3.0.21-win64.zip.sha256">sha</a></html>`;
    expect(parseVlcListing(html)).toEqual({ version: '3.0.21', zipName: 'vlc-3.0.21-win64.zip' });
  });

  it('format de page inattendu -> null (erreur douce)', () => {
    expect(parseVlcListing('<html>rien ici</html>')).toBeNull();
  });
});

describe('compareVersions', () => {
  it('compare numériquement segment par segment', () => {
    expect(compareVersions('3.0.9', '3.0.21')).toBeLessThan(0); // pas de tri lexical !
    expect(compareVersions('3.0.21', '3.0.21')).toBe(0);
    expect(compareVersions('4.0.0', '3.9.9')).toBeGreaterThan(0);
    expect(compareVersions('3.1', '3.0.9')).toBeGreaterThan(0); // longueurs différentes
  });
});

describe('isUpdateWorthwhile', () => {
  it('version installée inconnue -> toujours proposer', () => {
    expect(isUpdateWorthwhile(null, '3.0.21')).toBe(true);
  });

  it('propose seulement une version STRICTEMENT plus récente', () => {
    expect(isUpdateWorthwhile('3.0.20', '3.0.21')).toBe(true);
    expect(isUpdateWorthwhile('3.0.21', '3.0.21')).toBe(false);
    expect(isUpdateWorthwhile('3.0.22', '3.0.21')).toBe(false);
  });
});
