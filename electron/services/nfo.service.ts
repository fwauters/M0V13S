/**
 * Sidecars `.nfo` — format XML Kodi/Jellyfin (PLAN § 6.2, principe n° 2).
 *
 * Le `.nfo` posé à côté de chaque vidéo est la version « voyageuse » de la
 * fiche : un dossier partagé complet (vidéo + .nfo + images) se réimporte
 * sans internet et sans questions. La DB reste un index reconstructible ;
 * toute édition de fiche RÉÉCRIT son `.nfo` (règle CLAUDE.md).
 *
 * Garanties :
 * - écriture ATOMIQUE (fichier temporaire puis rename — un crash ne laisse
 *   jamais un .nfo à moitié écrit) ;
 * - parseur TOLÉRANT : balises inconnues ignorées (fichiers venant de Kodi,
 *   Jellyfin, tinyMediaManager…), XML illisible → null (l'appelant traite
 *   le fichier comme « sans nfo », jamais de plantage) ;
 * - `watch_state` (vu/reprise) N'EST JAMAIS exporté : personnel (PLAN § 1).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

/** Un acteur du casting (ordre = position d'affichage). */
export interface NfoActor {
  name: string;
  /** Nom du personnage (balise <role> Kodi), ou null. */
  character: string | null;
}

/** La fiche film telle qu'elle voyage dans un `.nfo`. */
export interface MovieNfo {
  /** Titre VO — <originaltitle> (seul champ obligatoire). */
  titleVo: string;
  /** Titre VF — <title> (affiché par Kodi), ou null. */
  titleVf: string | null;
  year: number | null;
  /** Synopsis — <plot>. */
  overview: string | null;
  /** Note personnelle 0-10 — <userrating>. */
  personalRating: number | null;
  /** Identifiant TMDB — <uniqueid type="tmdb">. */
  tmdbId: number | null;
  /** Clé YouTube du trailer — <trailer> (formats Kodi et URL acceptés). */
  trailerYoutubeKey: string | null;
  directors: string[];
  /** Scénaristes — balises <credits>. */
  writers: string[];
  actors: NfoActor[];
  genres: string[];
  tags: string[];
}

/* ------------------------------------------------------------------ */
/* Chemins                                                             */
/* ------------------------------------------------------------------ */

/** Chemin du sidecar `.nfo` d'une vidéo : même dossier, même nom de base. */
export function nfoPathForVideo(videoPath: string): string {
  const ext = path.extname(videoPath);
  return videoPath.slice(0, videoPath.length - ext.length) + '.nfo';
}

/* ------------------------------------------------------------------ */
/* Construction XML (fiche -> .nfo)                                    */
/* ------------------------------------------------------------------ */

const builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true,
  suppressEmptyNode: true,
});

/**
 * Sérialise une fiche en XML Kodi `<movie>`.
 * Les champs vides sont OMIS (pas de balises vides) ; l'ordre suit les
 * conventions Kodi pour rester lisible par un humain.
 */
export function buildMovieNfoXml(nfo: MovieNfo): string {
  // Objet intermédiaire : uniquement les champs renseignés.
  const movie: Record<string, unknown> = {};

  // Kodi affiche <title> : la VF si on l'a, sinon la VO.
  movie['title'] = nfo.titleVf ?? nfo.titleVo;
  movie['originaltitle'] = nfo.titleVo;
  if (nfo.year !== null) {
    movie['year'] = nfo.year;
  }
  if (nfo.overview !== null && nfo.overview !== '') {
    movie['plot'] = nfo.overview;
  }
  if (nfo.personalRating !== null) {
    movie['userrating'] = nfo.personalRating;
  }
  if (nfo.tmdbId !== null) {
    movie['uniqueid'] = { '@_type': 'tmdb', '@_default': 'true', '#text': nfo.tmdbId };
  }
  if (nfo.trailerYoutubeKey !== null) {
    // Format plugin Kodi : lisible par Kodi/Jellyfin, re-parsable par nous.
    movie['trailer'] =
      `plugin://plugin.video.youtube/?action=play_video&videoid=${nfo.trailerYoutubeKey}`;
  }
  if (nfo.genres.length > 0) {
    movie['genre'] = nfo.genres;
  }
  if (nfo.tags.length > 0) {
    movie['tag'] = nfo.tags;
  }
  if (nfo.directors.length > 0) {
    movie['director'] = nfo.directors;
  }
  if (nfo.writers.length > 0) {
    movie['credits'] = nfo.writers;
  }
  if (nfo.actors.length > 0) {
    movie['actor'] = nfo.actors.map((actor, order) => ({
      name: actor.name,
      // <role> = personnage (convention Kodi), omis si inconnu.
      ...(actor.character !== null ? { role: actor.character } : {}),
      order,
    }));
  }

  const xml: string = builder.build({ movie });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${xml}`;
}

/* ------------------------------------------------------------------ */
/* Parsing XML (.nfo -> fiche) — tolérant                              */
/* ------------------------------------------------------------------ */

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Les valeurs restent des CHAÎNES (sinon un titre comme « 1917 »
  // deviendrait un nombre) ; year/userrating sont convertis à la main.
  parseTagValue: false,
});

/** Normalise « valeur simple ou tableau » -> tableau (quirk XML/parseur). */
function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/** Texte d'un nœud qui peut être une chaîne nue ou un objet à attributs. */
function textOf(node: unknown): string | null {
  if (typeof node === 'string') {
    return node;
  }
  if (typeof node === 'object' && node !== null && '#text' in node) {
    const text = (node as Record<string, unknown>)['#text'];
    return typeof text === 'string' ? text : text === undefined ? null : String(text);
  }
  return null;
}

/** Entier positif depuis un nœud texte, ou null si illisible. */
function intOf(node: unknown): number | null {
  const text = textOf(node);
  if (text === null) {
    return null;
  }
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) ? value : null;
}

/**
 * Extrait la clé YouTube d'une balise <trailer>, quel que soit le format
 * rencontré dans la nature : plugin Kodi (`videoid=` / `video_id=`),
 * URL watch (`v=`) ou lien court (`youtu.be/`). Null si aucun ne matche.
 */
function youtubeKeyOf(node: unknown): string | null {
  const text = textOf(node);
  if (text === null) {
    return null;
  }
  const match =
    /(?:videoid=|video_id=|[?&]v=|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(text);
  return match?.[1] ?? null;
}

/**
 * Parse un contenu `.nfo` en fiche film.
 * @returns null si le XML est illisible ou si la racine n'est pas <movie>
 *          (ex. <episodedetails> d'une série) — l'appelant traite alors le
 *          fichier comme « sans nfo », sans erreur.
 */
export function parseMovieNfoXml(xml: string): MovieNfo | null {
  let root: Record<string, unknown>;
  try {
    root = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return null;
  }

  const movie = root['movie'];
  if (typeof movie !== 'object' || movie === null) {
    return null;
  }
  const m = movie as Record<string, unknown>;

  // Titres : <originaltitle> = VO ; à défaut <title> sert de VO.
  const title = textOf(m['title']);
  const originalTitle = textOf(m['originaltitle']);
  const titleVo = originalTitle ?? title;
  if (titleVo === null || titleVo.trim() === '') {
    return null; // fiche inexploitable sans titre
  }
  // <title> n'est une VF que s'il diffère de la VO.
  const titleVf = title !== null && title !== titleVo ? title : null;

  // <uniqueid> : peut être multiple (imdb, tmdb…) — on cherche type="tmdb".
  const tmdbNode = asArray(m['uniqueid']).find(
    (n) =>
      typeof n === 'object' &&
      n !== null &&
      (n as Record<string, unknown>)['@_type'] === 'tmdb',
  );

  return {
    titleVo,
    titleVf,
    year: intOf(m['year']),
    overview: textOf(m['plot']),
    personalRating: intOf(m['userrating']),
    tmdbId: tmdbNode === undefined ? null : intOf(tmdbNode),
    trailerYoutubeKey: youtubeKeyOf(m['trailer']),
    directors: asArray(m['director'])
      .map(textOf)
      .filter((n): n is string => n !== null && n !== ''),
    writers: asArray(m['credits'])
      .map(textOf)
      .filter((n): n is string => n !== null && n !== ''),
    actors: asArray(m['actor'])
      .map((node): NfoActor | null => {
        if (typeof node !== 'object' || node === null) {
          return null;
        }
        const actor = node as Record<string, unknown>;
        const name = textOf(actor['name']);
        return name === null || name === ''
          ? null
          : { name, character: textOf(actor['role']) };
      })
      .filter((a): a is NfoActor => a !== null),
    genres: asArray(m['genre'])
      .map(textOf)
      .filter((n): n is string => n !== null && n !== ''),
    tags: asArray(m['tag'])
      .map(textOf)
      .filter((n): n is string => n !== null && n !== ''),
  };
}

/* ------------------------------------------------------------------ */
/* Lecture / écriture disque                                           */
/* ------------------------------------------------------------------ */

/**
 * Écrit (ou remplace) ATOMIQUEMENT le `.nfo` d'une vidéo : écriture dans un
 * fichier temporaire du même dossier puis rename — jamais de fichier à
 * moitié écrit, même en cas de crash ou de disque débranché.
 * @returns le chemin absolu du `.nfo` écrit
 */
export async function writeMovieNfo(videoAbsPath: string, nfo: MovieNfo): Promise<string> {
  const nfoPath = nfoPathForVideo(videoAbsPath);
  const tmpPath = `${nfoPath}.tmp`;
  await fs.writeFile(tmpPath, buildMovieNfoXml(nfo), 'utf8');
  await fs.rename(tmpPath, nfoPath);
  return nfoPath;
}

/**
 * Lit le `.nfo` d'une vidéo s'il existe.
 * @returns la fiche, ou null si absent/illisible (jamais d'exception).
 */
export async function readMovieNfoFor(videoAbsPath: string): Promise<MovieNfo | null> {
  try {
    const xml = await fs.readFile(nfoPathForVideo(videoAbsPath), 'utf8');
    return parseMovieNfoXml(xml);
  } catch {
    return null;
  }
}
