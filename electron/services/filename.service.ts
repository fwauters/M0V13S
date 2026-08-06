/**
 * Devine titre, année et numéro de partie depuis un NOM DE FICHIER vidéo.
 * Logique 100 % pure (testée dans filename.service.spec.ts) — c'est le
 * préremplissage de l'assistant de qualification (PLAN § 6.2.3b) : le
 * résultat est toujours modifiable par l'utilisateur, jamais définitif.
 *
 * Exemples visés :
 *   "Prometheus.2012.1080p.BluRay.x264-GRP.mkv" -> { title: "Prometheus", year: 2012 }
 *   "Blade Runner 2049 (2017).mkv"              -> { title: "Blade Runner 2049", year: 2017 }
 *   "Avatar.CD1.avi"                            -> { title: "Avatar", partNumber: 1 }
 */
import path from 'node:path';

/** Résultat du parsing d'un nom de fichier. */
export interface ParsedFilename {
  /** Titre deviné, nettoyé (séparateurs et jargon de release retirés). */
  title: string;
  /** Année détectée (1900-2099), ou null si introuvable. */
  year: number | null;
  /** Numéro de partie pour les rips multi-fichiers (CD1 → 1), ou null. */
  partNumber: number | null;
  /**
   * Vrai si le nom ressemble à un épisode de série (S01E02, 1x05…).
   * V1 : ces fichiers sont signalés et laissés de côté par le scanner
   * (l'UI séries arrive plus tard, le schéma est déjà prêt).
   */
  looksLikeEpisode: boolean;
}

/** Motifs d'épisode de série : S01E02, s1.e2, 1x05… */
const EPISODE_PATTERN = /\bS\d{1,2}[.\s_-]?E\d{1,3}\b|\b\d{1,2}x\d{2,3}\b/i;

/** Motif de partie multi-fichiers : CD1, disc 2, part3, pt.1… */
const PART_PATTERN = /\b(?:cd|disc|disk|part|pt)[\s._-]?(\d{1,2})\b/i;

/**
 * Jargon de release « dur » : dès qu'un de ces mots apparaît, lui et tout
 * ce qui suit ne font plus partie du titre (résolution, source, codec…).
 */
const HARD_TOKENS = new Set([
  '480p', '576p', '720p', '1080p', '1440p', '2160p', '4k', 'uhd',
  'bluray', 'blu-ray', 'bdrip', 'brrip', 'webrip', 'web-dl', 'webdl', 'hdtv',
  'dvdrip', 'dvdscr', 'dvd', 'hdrip', 'camrip', 'screener',
  'x264', 'x265', 'h264', 'h265', 'hevc', 'avc', 'xvid', 'divx',
  'hdr', 'hdr10', 'dolbyvision', '10bit', '8bit',
  'aac', 'ac3', 'eac3', 'dts', 'truehd', 'atmos', 'mp3', 'flac',
  'remux', 'proper', 'repack', 'internal', 'limited',
]);

/**
 * Jargon « mou » : retiré du titre où qu'il soit, mais ne coupe pas la
 * suite (mentions de langue et d'édition, fréquentes dans les noms FR).
 */
const SOFT_TOKENS = new Set([
  'multi', 'vf', 'vff', 'vfq', 'vo', 'vost', 'vostfr', 'french', 'truefrench',
  'english', 'subfrench', 'extended', 'unrated', 'remastered', 'imax',
]);

/**
 * Analyse un nom (ou chemin) de fichier vidéo.
 * @param fileName nom de fichier, avec ou sans dossier/extension
 */
export function parseFilename(fileName: string): ParsedFilename {
  // 1. Nom seul, sans dossiers ni extension.
  let name = path.basename(fileName, path.extname(fileName));

  const looksLikeEpisode = EPISODE_PATTERN.test(name);

  // 2. Numéro de partie : extrait PUIS retiré du nom.
  let partNumber: number | null = null;
  const partMatch = PART_PATTERN.exec(name);
  if (partMatch?.[1] !== undefined) {
    partNumber = Number(partMatch[1]);
    name = name.replace(PART_PATTERN, ' ');
  }

  // 3. Séparateurs scène (points, underscores) -> espaces.
  //    Les tirets sont conservés : souvent partie du titre (Spider-Man).
  name = name.replace(/[._]/g, ' ');

  // 4. Année : DERNIÈRE occurrence plausible, sauf si c'est le tout début
  //    du nom (titres comme « 1917 » ou « 2001 A Space Odyssey »).
  //    Le titre est ce qui précède l'année retenue.
  let year: number | null = null;
  let titlePart = name;
  const yearMatches = [...name.matchAll(/\b(19|20)\d{2}\b/g)];
  const lastYear = yearMatches.at(-1);
  if (lastYear && lastYear.index > 0) {
    year = Number(lastYear[0]);
    titlePart = name.slice(0, lastYear.index);
  }

  // 5. Nettoyage token par token : coupe au premier jargon « dur »,
  //    filtre le jargon « mou », ignore les restes de parenthèses/crochets.
  const words: string[] = [];
  for (const rawWord of titlePart.split(/\s+/)) {
    const word = rawWord.replace(/[()[\]{}]/g, '');
    if (word === '') {
      continue;
    }
    const lower = word.toLowerCase();
    if (HARD_TOKENS.has(lower)) {
      break;
    }
    if (SOFT_TOKENS.has(lower)) {
      continue;
    }
    words.push(word);
  }

  // 6. Assemblage final : espaces normalisés, tirets orphelins retirés.
  const title = words.join(' ').replace(/\s*-\s*$/, '').trim();

  return { title, year, partNumber, looksLikeEpisode };
}
