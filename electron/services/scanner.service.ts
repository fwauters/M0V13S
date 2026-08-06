/**
 * Scanner complet (mode admin) — PLAN § 6.2.
 *
 * Rôles :
 * - détecter les NOUVEAUX fichiers (analyse ffprobe + parsing du nom pour
 *   préremplir l'assistant de qualification) ;
 * - détecter les fichiers MANQUANTS (suppression de fiche SUR CONFIRMATION
 *   uniquement — jamais silencieuse) ;
 * - proposer les RE-LIENS probables (même taille, et même durée quand elle
 *   est connue) au lieu de recréer une fiche ;
 * - QUALIFIER un nouveau fichier : créer la fiche complète (média + fichier
 *   + personnes/genres/tags) en une transaction.
 *
 * Le scan est asynchrone, remonte sa progression et est annulable
 * (exigence CLAUDE.md : ne jamais bloquer l'UI).
 */
import { and, eq } from 'drizzle-orm';

import type {
  QualifyActor,
  QualifyMovieInput,
  ScanImportedFile,
  ScanNewFile,
  ScanProgress,
  ScanRelinkCandidate,
  ScanResult,
} from '@shared/dto';
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
import { diffLibrary } from './conformity.logic';
import { probeFile } from './ffprobe.service';
import { parseFilename } from './filename.service';
import { MovieNfo, readMovieNfoFor, writeMovieNfo } from './nfo.service';
import { fromDriveRelative } from './paths.logic';
import { getDriveRoot } from './paths.service';
import type { SettingsService } from './settings.service';
import { FoundFile, walkLibraryRoots } from './walker.service';

/** Type de la transaction Drizzle (même interface de requête que la DB). */
type Tx = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];

/** Réalisateurs/scénaristes : simples noms -> forme commune sans personnage. */
function asActors(names: string[]): QualifyActor[] {
  return names.map((name) => ({ name, character: null }));
}

export class ScannerService {
  /** Drapeau d'annulation du scan en cours (vérifié entre chaque fichier). */
  private cancelRequested = false;

  constructor(
    private readonly db: AppDatabase,
    private readonly settings: SettingsService,
    /** Racine du lecteur — injectable pour tester sur un dossier temporaire. */
    private readonly driveRoot: () => string = getDriveRoot,
  ) {}

  /** Demande l'arrêt du scan en cours (effectif au prochain fichier). */
  cancel(): void {
    this.cancelRequested = true;
  }

  /**
   * Scan complet des racines de bibliothèque.
   * @param onProgress rappel de progression (analyse des nouveaux fichiers)
   */
  async scan(onProgress?: (p: ScanProgress) => void): Promise<ScanResult> {
    this.cancelRequested = false;
    const driveRoot = this.driveRoot();
    const found = walkLibraryRoots(driveRoot, this.settings.getLibraryRoots());
    const foundByRelPath = new Map(found.map((f) => [f.relPath, f]));

    const knownRows = this.db
      .select({
        id: videoFiles.id,
        relPath: videoFiles.relPath,
        mediaId: videoFiles.mediaId,
        sizeBytes: videoFiles.sizeBytes,
        durationSec: videoFiles.durationSec,
      })
      .from(videoFiles)
      .all();

    const diff = diffLibrary(
      knownRows.map((k) => k.relPath),
      found.map((f) => f.relPath),
    );

    // --- Nouveaux fichiers : ffprobe + parsing du nom (progression). ---
    const newFiles: ScanNewFile[] = [];
    const unknownFiles = diff.unknownPresent
      .map((relPath) => foundByRelPath.get(relPath))
      .filter((f): f is FoundFile => f !== undefined);

    let done = 0;
    for (const file of unknownFiles) {
      if (this.cancelRequested) {
        break; // scan partiel : l'UI présente ce qui a été analysé
      }
      onProgress?.({ done, total: unknownFiles.length, current: file.relPath });

      // L'échec de ffprobe (fichier corrompu, outil absent) n'interrompt
      // pas le scan : la fiche restera qualifiable, sans infos techniques.
      let tech = null;
      try {
        tech = await probeFile(fromDriveRelative(driveRoot, file.relPath));
      } catch {
        tech = null;
      }

      newFiles.push({
        relPath: file.relPath,
        sizeBytes: file.sizeBytes,
        mtimeMs: file.mtimeMs,
        tech,
        guess: parseFilename(file.relPath),
      });
      done += 1;
    }
    onProgress?.({ done, total: unknownFiles.length, current: '' });

    // --- Manquants : fiches dont le fichier a disparu. ---
    const missingRows = knownRows.filter((k) => diff.missingKnown.includes(k.relPath));
    const missingFiles = missingRows
      .filter((row) => row.mediaId !== null)
      .map((row) => ({
        videoFileId: row.id,
        mediaId: row.mediaId as number,
        relPath: row.relPath,
        mediaTitle: this.mediaTitle(row.mediaId as number),
      }));

    // --- Re-liens probables : disparu <-> nouveau de même taille
    //     (+ même durée quand les deux sont connues). ---
    const relinkCandidates: ScanRelinkCandidate[] = [];
    for (const missing of missingRows) {
      const candidate = newFiles.find(
        (n) =>
          n.sizeBytes === missing.sizeBytes &&
          (missing.durationSec === null ||
            n.tech === null ||
            n.tech.durationSec === null ||
            n.tech.durationSec === missing.durationSec),
      );
      if (candidate && missing.mediaId !== null) {
        relinkCandidates.push({
          videoFileId: missing.id,
          mediaTitle: this.mediaTitle(missing.mediaId),
          oldRelPath: missing.relPath,
          newRelPath: candidate.relPath,
          newSizeBytes: candidate.sizeBytes,
          newMtimeMs: candidate.mtimeMs,
        });
      }
    }

    // Les candidats au re-lien ne sont pas proposés en qualification :
    // l'utilisateur tranchera (re-lien ou nouvelle fiche) dans l'UI.
    const relinkPaths = new Set(relinkCandidates.map((c) => c.newRelPath));
    const remaining = newFiles.filter((f) => !relinkPaths.has(f.relPath));

    // --- Import SILENCIEUX des fichiers arrivés avec leur .nfo (PLAN
    //     § 6.2.2) : la fiche voyage avec le fichier, elle est importée
    //     sans question et HORS LIGNE — c'est ce qui rend le partage
    //     fluide. Après les re-liens : un fichier renommé garde sa fiche
    //     au lieu d'en créer une seconde. Le .nfo existant n'est PAS
    //     réécrit (il peut porter des champs d'autres outils qu'on ne
    //     modélise pas — on ne détruit jamais de données utilisateur). ---
    const importedFromNfo: ScanImportedFile[] = [];
    const toQualify: ScanNewFile[] = [];
    for (const file of remaining) {
      const nfo = await readMovieNfoFor(fromDriveRelative(driveRoot, file.relPath));
      if (nfo === null) {
        toQualify.push(file);
        continue;
      }
      try {
        this.createOrAttachMovie(this.nfoToQualifyInput(file, nfo));
        importedFromNfo.push({
          relPath: file.relPath,
          title: nfo.titleVf ?? nfo.titleVo,
        });
      } catch (error) {
        // Un .nfo importable mais une insertion qui échoue : le fichier
        // repart en qualification manuelle, le scan continue.
        console.warn(`Import .nfo impossible pour ${file.relPath} :`, error);
        toQualify.push(file);
      }
    }

    return {
      newFiles: toQualify,
      missingFiles,
      relinkCandidates,
      importedFromNfo,
    };
  }

  /**
   * Qualifie un film (assistant manuel ou préremplissage TMDB) :
   * crée/complète la fiche en transaction PUIS écrit le sidecar `.nfo`
   * (règle CLAUDE.md : les sidecars sont le reflet exact de l'index).
   * @returns l'id du média créé ou complété
   */
  async qualify(input: QualifyMovieInput): Promise<number> {
    const mediaId = this.createOrAttachMovie(input);

    // L'échec d'écriture du .nfo (dossier en lecture seule…) ne doit pas
    // annuler la qualification : la fiche est en base, le sidecar sera
    // réécrit à la prochaine édition.
    try {
      await writeMovieNfo(
        fromDriveRelative(this.driveRoot(), input.relPath),
        this.qualifyInputToNfo(input),
      );
    } catch (error) {
      console.warn(`Écriture du .nfo impossible pour ${input.relPath} :`, error);
    }

    return mediaId;
  }

  /**
   * Cœur transactionnel de la création de fiche (assistant ET import .nfo).
   * Réutilisation d'une fiche existante, dans l'ordre :
   * 1. même identifiant TMDB (import .nfo multi-fichiers, enrichissement) ;
   * 2. même titre VO si le fichier est une partie (rips CD1/CD2).
   * @returns l'id du média créé ou complété
   */
  private createOrAttachMovie(input: QualifyMovieInput): number {
    return this.db.transaction((tx) => {
      let mediaId: number | null = null;
      if (input.tmdbId !== null) {
        const existing = tx
          .select({ id: media.id })
          .from(media)
          .where(and(eq(media.type, 'movie'), eq(media.tmdbId, input.tmdbId)))
          .get();
        mediaId = existing?.id ?? null;
      }
      if (mediaId === null && input.partNumber !== null) {
        const existing = tx
          .select({ id: media.id })
          .from(media)
          .where(and(eq(media.type, 'movie'), eq(media.titleVo, input.titleVo)))
          .get();
        mediaId = existing?.id ?? null;
      }

      if (mediaId === null) {
        const created = tx
          .insert(media)
          .values({
            type: 'movie',
            titleVo: input.titleVo,
            titleVf: input.titleVf,
            year: input.year,
            overview: input.overview,
            personalRating: input.personalRating,
            tmdbId: input.tmdbId,
          })
          .returning({ id: media.id })
          .get();
        mediaId = created.id;

        // Relations (uniquement à la création de la fiche).
        this.linkPeople(tx, mediaId, asActors(input.directors), 'director');
        this.linkPeople(tx, mediaId, asActors(input.writers), 'writer');
        this.linkPeople(tx, mediaId, input.actors, 'actor');
        this.linkGenres(tx, mediaId, input.genres);
        this.linkTags(tx, mediaId, input.tags);
      }

      // Le fichier vidéo, rattaché à la fiche.
      tx.insert(videoFiles)
        .values({
          mediaId,
          relPath: input.relPath,
          sizeBytes: input.sizeBytes,
          mtimeMs: input.mtimeMs,
          partNumber: input.partNumber,
          durationSec: input.tech?.durationSec ?? null,
          videoCodec: input.tech?.videoCodec ?? null,
          audioCodec: input.tech?.audioCodec ?? null,
          width: input.tech?.width ?? null,
          height: input.tech?.height ?? null,
        })
        .run();

      return mediaId;
    });
  }

  /** Convertit une fiche `.nfo` importée en saisie de qualification. */
  private nfoToQualifyInput(file: ScanNewFile, nfo: MovieNfo): QualifyMovieInput {
    return {
      relPath: file.relPath,
      sizeBytes: file.sizeBytes,
      mtimeMs: file.mtimeMs,
      tech: file.tech,
      partNumber: file.guess.partNumber,
      titleVo: nfo.titleVo,
      titleVf: nfo.titleVf,
      year: nfo.year,
      overview: nfo.overview,
      personalRating: nfo.personalRating,
      tmdbId: nfo.tmdbId,
      directors: nfo.directors,
      writers: nfo.writers,
      actors: nfo.actors,
      genres: nfo.genres,
      tags: nfo.tags,
    };
  }

  /** Convertit une saisie de qualification en fiche `.nfo` à écrire. */
  private qualifyInputToNfo(input: QualifyMovieInput): MovieNfo {
    return {
      titleVo: input.titleVo,
      titleVf: input.titleVf,
      year: input.year,
      overview: input.overview,
      personalRating: input.personalRating,
      tmdbId: input.tmdbId,
      directors: input.directors,
      writers: input.writers,
      actors: input.actors,
      genres: input.genres,
      tags: input.tags,
    };
  }

  /** Re-lie un fichier renommé/déplacé sur sa fiche existante. */
  relink(videoFileId: number, newRelPath: string, sizeBytes: number, mtimeMs: number): void {
    this.db
      .update(videoFiles)
      .set({ relPath: newRelPath, sizeBytes, mtimeMs, status: 'ok', scannedAt: Date.now() })
      .where(eq(videoFiles.id, videoFileId))
      .run();
  }

  /**
   * Supprime une fiche et tout ce qui s'y rattache (cascade SQLite).
   * N'est appelé QUE depuis l'UI après confirmation explicite (PLAN § 6.2.1).
   */
  deleteMedia(mediaId: number): void {
    this.db.delete(media).where(eq(media.id, mediaId)).run();
  }

  /* ----------------- aides privées (jonctions) ------------------- */

  /** Titre d'affichage d'une fiche (VF sinon VO). */
  private mediaTitle(mediaId: number): string {
    const row = this.db
      .select({ titleVo: media.titleVo, titleVf: media.titleVf })
      .from(media)
      .where(eq(media.id, mediaId))
      .get();
    return row?.titleVf ?? row?.titleVo ?? '?';
  }

  /** Trouve-ou-crée des personnes par nom et les lie avec un rôle
   *  (+ personnage pour les acteurs, venu des `.nfo` ou de TMDB). */
  private linkPeople(
    tx: Tx,
    mediaId: number,
    persons: QualifyActor[],
    role: 'director' | 'writer' | 'actor',
  ): void {
    persons
      .map((p) => ({ ...p, name: p.name.trim() }))
      .filter((p) => p.name !== '')
      .forEach((person, sortOrder) => {
        const existing = tx
          .select({ id: people.id })
          .from(people)
          .where(eq(people.name, person.name))
          .get();
        const personId =
          existing?.id ??
          tx.insert(people).values({ name: person.name }).returning({ id: people.id }).get().id;
        tx.insert(mediaPeople)
          .values({ mediaId, personId, role, character: person.character, sortOrder })
          .onConflictDoNothing()
          .run();
      });
  }

  /** Trouve-ou-crée des genres par nom et les lie à la fiche. */
  private linkGenres(tx: Tx, mediaId: number, names: string[]): void {
    for (const raw of names) {
      const name = raw.trim();
      if (name === '') {
        continue;
      }
      const existing = tx.select({ id: genres.id }).from(genres).where(eq(genres.name, name)).get();
      const genreId =
        existing?.id ?? tx.insert(genres).values({ name }).returning({ id: genres.id }).get().id;
      tx.insert(mediaGenres).values({ mediaId, genreId }).onConflictDoNothing().run();
    }
  }

  /** Trouve-ou-crée des tags par nom et les lie à la fiche. */
  private linkTags(tx: Tx, mediaId: number, names: string[]): void {
    for (const raw of names) {
      const name = raw.trim();
      if (name === '') {
        continue;
      }
      const existing = tx.select({ id: tags.id }).from(tags).where(eq(tags.name, name)).get();
      const tagId =
        existing?.id ?? tx.insert(tags).values({ name }).returning({ id: tags.id }).get().id;
      tx.insert(mediaTags).values({ mediaId, tagId }).onConflictDoNothing().run();
    }
  }
}
