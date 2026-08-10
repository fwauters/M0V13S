/**
 * Noms humains des langues de pistes audio/sous-titres.
 *
 * ffprobe remonte des codes ISO 639-2 tagués dans le conteneur (fre,
 * eng, jpn…). `Intl.DisplayNames` (intégré au runtime, hors ligne) les
 * traduit dans la langue de l'UI — il ne comprend bien que les codes
 * BCP-47 : on mappe donc d'abord les codes 639-2 courants (variantes
 * bibliographiques ET terminologiques) vers leur code à 2 lettres.
 * Code inconnu → affiché tel quel en majuscules (jamais d'erreur).
 */

/** ISO 639-2 (B et T) → ISO 639-1 pour les langues courantes. */
const ISO_639_2_TO_1: Readonly<Record<string, string>> = {
  fre: 'fr', fra: 'fr',
  eng: 'en',
  ger: 'de', deu: 'de',
  spa: 'es',
  ita: 'it',
  por: 'pt',
  dut: 'nl', nld: 'nl',
  jpn: 'ja',
  kor: 'ko',
  chi: 'zh', zho: 'zh',
  rus: 'ru',
  ara: 'ar',
  pol: 'pl',
  tur: 'tr',
  swe: 'sv',
  nor: 'no',
  dan: 'da',
  fin: 'fi',
  cze: 'cs', ces: 'cs',
  hun: 'hu',
  gre: 'el', ell: 'el',
  heb: 'he',
  hin: 'hi',
  tha: 'th',
  vie: 'vi',
  ukr: 'uk',
  rum: 'ro', ron: 'ro',
};

/**
 * Nom d'une langue de piste dans la langue d'affichage demandée.
 * @param code   code de piste (ISO 639-2 ou 639-1, insensible à la casse)
 * @param locale langue d'affichage de l'UI (`fr`, `en`…)
 * @returns nom traduit, première lettre en capitale (ex. « Français »),
 *          ou le code en MAJUSCULES si intraduisible.
 */
export function languageDisplayName(code: string, locale: string): string {
  const normalized = code.toLowerCase();
  const bcp47 = ISO_639_2_TO_1[normalized] ?? normalized;
  try {
    const name = new Intl.DisplayNames([locale], { type: 'language' }).of(bcp47);
    if (name === undefined || name === bcp47) {
      return code.toUpperCase();
    }
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1);
  } catch {
    return code.toUpperCase();
  }
}
