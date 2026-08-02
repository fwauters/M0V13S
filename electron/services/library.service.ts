/**
 * Lecture de la bibliothèque pour le mode classique (liste + fiches).
 *
 * Règle d'affichage absolue (PLAN § 6.1.3) appliquée ICI, dans la requête :
 * un film n'apparaît que s'il possède AU MOINS un fichier `status = ok`
 * (présent sur le disque ET reconnu par l'index).
 */
import { and, asc, eq, inArray } from 'drizzle-orm';

import type { MovieDetail, MovieListItem, MoviePerson } from '@shared/dto';
import type { AppDatabase } from '../db/client';
import {
  genres,
  media,
  mediaGenres,
  mediaPeople,
  mediaTags,
  people,
  tags,
  videoFiles,
} from '../db/schema';

export class LibraryService {
  constructor(private readonly db: AppDatabase) {}

  /** Liste des films affichables, triés par titre. */
  listMovies(): MovieListItem[] {
    // 1. Films ayant au moins un fichier présent (règle d'affichage).
    const rows = this.db
      .selectDistinct({
        id: media.id,
        titleVo: media.titleVo,
        titleVf: media.titleVf,
        year: media.year,
        durationSec: videoFiles.durationSec,
      })
      .from(media)
      .innerJoin(
        videoFiles,
        and(eq(videoFiles.mediaId, media.id), eq(videoFiles.status, 'ok')),
      )
      .where(eq(media.type, 'movie'))
      .orderBy(asc(media.titleVo))
      .all();

    // Dédoublonnage par média (multi-fichiers) : première durée connue.
    const byId = new Map<number, MovieListItem>();
    for (const row of rows) {
      const existing = byId.get(row.id);
      if (existing === undefined) {
        byId.set(row.id, {
          id: row.id,
          titleVo: row.titleVo,
          titleVf: row.titleVf,
          year: row.year,
          durationSec: row.durationSec,
          genres: [],
        });
      } else if (existing.durationSec === null && row.durationSec !== null) {
        existing.durationSec = row.durationSec;
      }
    }

    // 2. Genres en une seule requête pour toute la liste.
    const ids = [...byId.keys()];
    if (ids.length > 0) {
      const genreRows = this.db
        .select({ mediaId: mediaGenres.mediaId, name: genres.name })
        .from(mediaGenres)
        .innerJoin(genres, eq(genres.id, mediaGenres.genreId))
        .where(inArray(mediaGenres.mediaId, ids))
        .all();
      for (const g of genreRows) {
        byId.get(g.mediaId)?.genres.push(g.name);
      }
    }

    return [...byId.values()];
  }

  /** Fiche détaillée (null si inconnue ou pas un film). */
  getMovie(id: number): MovieDetail | null {
    const m = this.db
      .select()
      .from(media)
      .where(and(eq(media.id, id), eq(media.type, 'movie')))
      .get();
    if (m === undefined) {
      return null;
    }

    const files = this.db
      .select()
      .from(videoFiles)
      .where(eq(videoFiles.mediaId, id))
      .orderBy(asc(videoFiles.partNumber))
      .all();

    const genreRows = this.db
      .select({ name: genres.name })
      .from(mediaGenres)
      .innerJoin(genres, eq(genres.id, mediaGenres.genreId))
      .where(eq(mediaGenres.mediaId, id))
      .all();

    const tagRows = this.db
      .select({ name: tags.name })
      .from(mediaTags)
      .innerJoin(tags, eq(tags.id, mediaTags.tagId))
      .where(eq(mediaTags.mediaId, id))
      .all();

    const peopleRows = this.db
      .select({
        name: people.name,
        role: mediaPeople.role,
        character: mediaPeople.character,
        sortOrder: mediaPeople.sortOrder,
      })
      .from(mediaPeople)
      .innerJoin(people, eq(people.id, mediaPeople.personId))
      .where(eq(mediaPeople.mediaId, id))
      .orderBy(asc(mediaPeople.sortOrder))
      .all();

    return {
      id: m.id,
      titleVo: m.titleVo,
      titleVf: m.titleVf,
      year: m.year,
      overview: m.overview,
      personalRating: m.personalRating,
      genres: genreRows.map((g) => g.name),
      tags: tagRows.map((t) => t.name),
      people: peopleRows.map(
        (p): MoviePerson => ({ name: p.name, role: p.role, character: p.character }),
      ),
      files: files.map((f) => ({
        id: f.id,
        relPath: f.relPath,
        sizeBytes: f.sizeBytes,
        partNumber: f.partNumber,
        status: f.status,
        tech: {
          durationSec: f.durationSec,
          videoCodec: f.videoCodec,
          audioCodec: f.audioCodec,
          width: f.width,
          height: f.height,
        },
      })),
    };
  }
}
