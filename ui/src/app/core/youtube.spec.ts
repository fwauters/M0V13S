import { parseYoutubeKey } from './youtube';

/**
 * Tests du parseur de saisie « Trailer » (URL YouTube ou clé brute) —
 * mêmes formats que le parseur de `.nfo` côté main.
 */
describe('parseYoutubeKey', () => {
  it('extrait la clé des URL YouTube courantes', () => {
    expect(parseYoutubeKey('https://www.youtube.com/watch?v=AbC123xyz_-')).toBe('AbC123xyz_-');
    expect(parseYoutubeKey('https://youtu.be/AbC123xyz_-')).toBe('AbC123xyz_-');
    expect(parseYoutubeKey('https://www.youtube.com/embed/AbC123xyz_-')).toBe('AbC123xyz_-');
    expect(
      parseYoutubeKey('https://www.youtube.com/watch?list=PL123&v=AbC123xyz_-'),
    ).toBe('AbC123xyz_-');
  });

  it('accepte une clé brute telle quelle', () => {
    expect(parseYoutubeKey('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(parseYoutubeKey('  dQw4w9WgXcQ  ')).toBe('dQw4w9WgXcQ');
  });

  it('vide ou inexploitable → null (pas de trailer)', () => {
    expect(parseYoutubeKey('')).toBeNull();
    expect(parseYoutubeKey('   ')).toBeNull();
    expect(parseYoutubeKey('pas une clé !')).toBeNull();
    expect(parseYoutubeKey('https://vimeo.com/12345678')).toBeNull(); // pas YouTube
  });
});
