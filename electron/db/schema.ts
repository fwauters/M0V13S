/**
 * Schéma Drizzle de la base SQLite — index reconstructible de la
 * bibliothèque (PLAN § 5, validé avec l'utilisateur).
 *
 * Principes :
 * - Table `media` UNIFIÉE films + séries (champ `type`) : jonctions
 *   genres/tags/people définies une seule fois, browse et filtres communs.
 * - `video_files` en 1-N par film (multi-parties CD1/CD2, double version) ;
 *   pour les séries, les fichiers pointent vers un épisode.
 * - `watch_state` au niveau film OU épisode — personnel, jamais exporté
 *   dans les `.nfo`.
 * - Tous les chemins (`relPath`, `posterPath`…) sont RELATIFS à la racine
 *   du lecteur (voir paths.service) : un chemin absolu ici est un bug.
 *
 * V1 : seule la branche « movie » est exercée par l'UI ; les tables séries
 * existent et sont migrées, prêtes pour plus tard.
 *
 * Rappel : tout changement ici passe par `pnpm db:generate` (migration
 * versionnée) — jamais de modification de schéma à la main.
 */
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/* ------------------------------------------------------------------ */
/* Réglages                                                            */
/* ------------------------------------------------------------------ */

/**
 * Préférences et état de l'application (clé/valeur, valeur JSON si
 * structurée) : racines de bibliothèque (relatives), thème, langue,
 * clé API TMDB, hash du mot de passe admin…
 */
export const settings = sqliteTable('settings', {
  /** Nom de la préférence, en notation pointée (ex. `ui.theme`). */
  key: text('key').primaryKey(),
  /** Valeur sérialisée en texte (JSON si structurée). */
  value: text('value').notNull(),
});

/* ------------------------------------------------------------------ */
/* Fiches (films + séries)                                             */
/* ------------------------------------------------------------------ */

/** La fiche, commune aux films et aux séries. */
export const media = sqliteTable(
  'media',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Discriminant du type de fiche. */
    type: text('type', { enum: ['movie', 'series'] }).notNull(),
    /** Titre en version originale — seul champ de titre obligatoire. */
    titleVo: text('title_vo').notNull(),
    /** Titre français (souvent fourni par TMDB en phase 2). */
    titleVf: text('title_vf'),
    year: integer('year'),
    overview: text('overview'),
    /** Identifiant TMDB — permet ré-enrichissement et déduplication. */
    tmdbId: integer('tmdb_id'),
    /** Affiche/backdrop : chemins RELATIFS vers les sidecars (phase 2). */
    posterPath: text('poster_path'),
    backdropPath: text('backdrop_path'),
    /** Clé YouTube du trailer (lecture en ligne uniquement). */
    trailerYoutubeKey: text('trailer_youtube_key'),
    /** Note personnelle 0-10 (indépendante de TMDB). */
    personalRating: integer('personal_rating'),
    createdAt: integer('created_at')
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer('updated_at')
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [
    index('media_type_idx').on(t.type),
    index('media_tmdb_idx').on(t.tmdbId),
  ],
);

/** Saison d'une série (affiche/synopsis TMDB par saison). Réservé v2+. */
export const seasons = sqliteTable(
  'seasons',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    seriesId: integer('series_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title'),
    overview: text('overview'),
    posterPath: text('poster_path'),
  },
  (t) => [uniqueIndex('seasons_series_number_uq').on(t.seriesId, t.number)],
);

/** Épisode d'une saison. Réservé v2+. */
export const episodes = sqliteTable(
  'episodes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    seasonId: integer('season_id')
      .notNull()
      .references(() => seasons.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title'),
    overview: text('overview'),
    /** Vignette de l'épisode (chemin relatif, sidecar phase 2). */
    stillPath: text('still_path'),
    tmdbId: integer('tmdb_id'),
  },
  (t) => [uniqueIndex('episodes_season_number_uq').on(t.seasonId, t.number)],
);

/* ------------------------------------------------------------------ */
/* Fichiers vidéo                                                      */
/* ------------------------------------------------------------------ */

/**
 * Un fichier vidéo sur le disque — rattaché à un film OU à un épisode
 * (contrainte CHECK : exactement l'un des deux).
 * 1-N par film : couvre CD1/CD2 (`partNumber`) et les doubles versions.
 */
export const videoFiles = sqliteTable(
  'video_files',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mediaId: integer('media_id').references(() => media.id, {
      onDelete: 'cascade',
    }),
    episodeId: integer('episode_id').references(() => episodes.id, {
      onDelete: 'cascade',
    }),
    /** Chemin RELATIF à la racine du lecteur, séparateurs `/`. Unique. */
    relPath: text('rel_path').notNull().unique(),
    sizeBytes: integer('size_bytes').notNull(),
    /** mtime du fichier (ms epoch) — détection de modification au scan. */
    mtimeMs: integer('mtime_ms').notNull(),
    /** Données techniques extraites par ffprobe (null si pas encore analysé). */
    durationSec: integer('duration_sec'),
    videoCodec: text('video_codec'),
    audioCodec: text('audio_codec'),
    width: integer('width'),
    height: integer('height'),
    /** Numéro de partie pour les rips multi-fichiers (CD1 = 1, CD2 = 2…). */
    partNumber: integer('part_number'),
    /** `ok` = présent au dernier contrôle ; `missing` = disparu → masqué. */
    status: text('status', { enum: ['ok', 'missing'] })
      .notNull()
      .default('ok'),
    scannedAt: integer('scanned_at')
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [
    index('video_files_media_idx').on(t.mediaId),
    index('video_files_episode_idx').on(t.episodeId),
    index('video_files_status_idx').on(t.status),
    // Exactement UN propriétaire : film OU épisode.
    check('video_files_owner_check', sql`(${t.mediaId} IS NULL) <> (${t.episodeId} IS NULL)`),
  ],
);

/* ------------------------------------------------------------------ */
/* Personnes, genres, tags (jonctions uniques films + séries)          */
/* ------------------------------------------------------------------ */

/** Personne (réalisateur, scénariste, acteur…). */
export const people = sqliteTable(
  'people',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tmdbId: integer('tmdb_id'),
    name: text('name').notNull(),
  },
  (t) => [
    // Unicité TMDB (plusieurs NULL autorisés par SQLite pour les personnes
    // saisies à la main sans identifiant TMDB).
    uniqueIndex('people_tmdb_uq').on(t.tmdbId),
    index('people_name_idx').on(t.name),
  ],
);

/** Lien fiche <-> personne, qualifié par un rôle. */
export const mediaPeople = sqliteTable(
  'media_people',
  {
    mediaId: integer('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['director', 'writer', 'actor'] }).notNull(),
    /** Nom du personnage (acteurs uniquement). */
    character: text('character'),
    /** Ordre d'affichage (ordre du casting TMDB, ou de saisie). */
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.mediaId, t.personId, t.role] })],
);

/** Genre (référentiel TMDB ou saisie manuelle). */
export const genres = sqliteTable(
  'genres',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tmdbId: integer('tmdb_id'),
    name: text('name').notNull().unique(),
  },
  (t) => [uniqueIndex('genres_tmdb_uq').on(t.tmdbId)],
);

export const mediaGenres = sqliteTable(
  'media_genres',
  {
    mediaId: integer('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    genreId: integer('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.mediaId, t.genreId] })],
);

/** Tag libre, personnel (ex. « alien », « huis clos »). */
export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export const mediaTags = sqliteTable(
  'media_tags',
  {
    mediaId: integer('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.mediaId, t.tagId] })],
);

/* ------------------------------------------------------------------ */
/* État de visionnage (personnel — jamais exporté)                     */
/* ------------------------------------------------------------------ */

/**
 * Suivi de visionnage d'un film OU d'un épisode (CHECK : exactement l'un).
 * Alimenté par la lecture VLC (phase 4) et les actions manuelles.
 */
export const watchState = sqliteTable(
  'watch_state',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mediaId: integer('media_id').references(() => media.id, {
      onDelete: 'cascade',
    }),
    episodeId: integer('episode_id').references(() => episodes.id, {
      onDelete: 'cascade',
    }),
    watchCount: integer('watch_count').notNull().default(0),
    lastWatchedAt: integer('last_watched_at'),
    /** Position de reprise en secondes (null = pas de lecture en cours). */
    resumePositionSec: integer('resume_position_sec'),
    /** Vu jusqu'au bout (déclenché à > 90 % de la durée, PLAN § 6.3). */
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    // Un seul état par film / par épisode (NULL multiples autorisés).
    uniqueIndex('watch_state_media_uq').on(t.mediaId),
    uniqueIndex('watch_state_episode_uq').on(t.episodeId),
    check('watch_state_owner_check', sql`(${t.mediaId} IS NULL) <> (${t.episodeId} IS NULL)`),
  ],
);
