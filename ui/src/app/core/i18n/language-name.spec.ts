import { languageDisplayName } from './language-name';

/**
 * Tests du nom humain des langues de pistes (Intl.DisplayNames + mapping
 * ISO 639-2 → 639-1) — affichage suivant la langue de l'UI.
 */
describe('languageDisplayName', () => {
  it('traduit les codes ISO 639-2 courants dans la langue demandée', () => {
    expect(languageDisplayName('fre', 'fr')).toBe('Français');
    expect(languageDisplayName('eng', 'fr')).toBe('Anglais');
    expect(languageDisplayName('fre', 'en')).toBe('French');
    expect(languageDisplayName('jpn', 'en')).toBe('Japanese');
  });

  it('accepte les variantes bibliographiques ET terminologiques', () => {
    expect(languageDisplayName('ger', 'en')).toBe('German');
    expect(languageDisplayName('deu', 'en')).toBe('German');
  });

  it('est insensible à la casse du code', () => {
    expect(languageDisplayName('FRE', 'en')).toBe('French');
  });

  it('code inconnu → tel quel en majuscules, jamais d erreur', () => {
    expect(languageDisplayName('xxx', 'fr')).toBe('XXX');
  });
});
