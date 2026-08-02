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
  QualifyMovieInput,
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
import { fromDriveRelative } from './paths.logic';
import { getDriveRoot } from './paths.service';
import type { SettingsService } from './settings.service';
import { FoundFile, walkLibraryRoots } from './walker.service';

/** Type de la transaction Drizzle (même interface de requête que la DB). */
type Tx = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];

export class ScannerService {
  /** Drapeau d'annulation du scan en cours (vérifié entre chaque fichier). */
  private cancelRequested = false;

  constructor(
    private readonly db: AppDatabase,
    private readonly settings: SettingsService,
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
    const driveRoot = getDriveRoot();
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
    return {
      newFiles: newFiles.filter((f) => !relinkPaths.has(f.relPath)),
      missingFiles,
      relinkCandidates,
    };
  }

  /**
   * Crée la fiche d'un film qualifié manuellement (transaction unique).
   * Si `partNumber` est fourni et qu'une fiche de même titre VO existe
   * déjà, le fichier y est rattaché (rips CD1/CD2).
   * @returns l'id du média créé ou complété
   */
  qualify(input: QualifyMovieInput): number {
    return this.db.transaction((tx) => {
      // 1. Fiche : réutilisée pour les parties suivantes d'un multi-CD.
      let mediaId: number | null = null;
      if (input.partNumber !== null) {
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
          })
          .returning({ id: media.id })
          .get();
        mediaId = created.id;

        // 2. Relations (uniquement à la création de la fiche).
        this.linkPeople(tx, mediaId, input.directors, 'director');
        this.linkPeople(tx, mediaId, input.writers, 'writer');
        this.linkPeople(tx, mediaId, input.actors, 'actor');
        this.linkGenres(tx, mediaId, input.genres);
        this.linkTags(tx, mediaId, input.tags);
      }

      // 3. Le fichier vidéo, rattaché à la fiche.
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

  /** Trouve-ou-crée des personnes par nom et les lie avec un rôle. */
  private linkPeople(
    tx: Tx,
    mediaId: number,
    names: string[],
    role: 'director' | 'writer' | 'actor',
  ): void {
    names
      .map((n) => n.trim())
      .filter((n) => n !== '')
      .forEach((name, sortOrder) => {
        const existing = tx.select({ id: people.id }).from(people).where(eq(people.name, name)).get();
        const personId =
          existing?.id ??
          tx.insert(people).values({ name }).returning({ id: people.id }).get().id;
        tx.insert(mediaPeople)
          .values({ mediaId, personId, role, sortOrder })
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
