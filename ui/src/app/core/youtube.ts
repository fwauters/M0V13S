/**
 * Extraction d'une clé YouTube depuis une saisie utilisateur libre —
 * champ « Trailer » de l'édition manuelle (TMDB n'a pas toujours de
 * trailer, décision utilisateur phase 3).
 *
 * Formats acceptés : URL watch (`?v=`), lien court (`youtu.be/`), URL
 * d'embed (`/embed/`), format plugin Kodi (`videoid=`) — les mêmes que
 * le parseur de `.nfo` côté main — ou la clé brute elle-même.
 */

/** Une clé YouTube plausible : alphanumérique + `-_`, 6 caractères et plus. */
const RAW_KEY = /^[A-Za-z0-9_-]{6,}$/;

/** Clé extraite d'une URL connue, où qu'elle se trouve dans la chaîne. */
const KEY_IN_URL = /(?:videoid=|video_id=|[?&]v=|youtu\.be\/|\/embed\/)([A-Za-z0-9_-]{6,})/;

/**
 * @returns la clé YouTube, ou null si la saisie est vide ou
 *          inexploitable (l'appelant enregistre alors « pas de trailer »).
 */
export function parseYoutubeKey(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === '') {
    return null;
  }
  const fromUrl = KEY_IN_URL.exec(trimmed)?.[1];
  if (fromUrl !== undefined) {
    return fromUrl;
  }
  return RAW_KEY.test(trimmed) ? trimmed : null;
}
