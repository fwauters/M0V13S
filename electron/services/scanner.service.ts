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
import { and, asc, eq } from 'drizzle-orm';

import type {
  ExistingFiche,
  QualifyActor,
  QualifyMovieInput,
  ScanImportedFile,
  ScanNewFile,
  ScanProgress,
  ScanRelinkCandidate,
  ScanResult,
  TmdbMovieDetails,
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
import { MovieImages, ensureMovieImages, findExistingImages } from './images.service';
import { MovieNfo, readMovieNfoFor, writeMovieNfo } from './nfo.service';
import { fromDriveRelative, toDriveRelative } from './paths.logic';
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
    /** fetch pour les téléchargements d'images — injectable en test. */
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  /** Demande l'arrêt du scan en cours (effectif au prochain fichier). */
  cancel(): void {
    this.cancelRequested = true;
  }

  /**
   * Scan des racines de bibliothèque.
   * @param onProgress rappel de progression (analyse des fichiers)
   * @param options `full` = scan complet FORCÉ : les fichiers déjà indexés
   *                repassent aussi dans l'assistant, préremplis avec leur
   *                fiche existante — l'enregistrement la met à jour
   *                (demande utilisateur, phase 2).
   */
  async scan(
    onProgress?: (p: ScanProgress) => void,
    options: { full?: boolean } = {},
  ): Promise<ScanResult> {
    this.cancelRequested = false;
    const full = options.full === true;
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
    const knownByRelPath = new Map(knownRows.map((k) => [k.relPath, k]));

    const diff = diffLibrary(
      knownRows.map((k) => k.relPath),
      found.map((f) => f.relPath),
    );

    // --- Fichiers à analyser : les inconnus, + TOUS les fichiers présents
    //     en mode complet forcé (progression ffprobe dans les deux cas). ---
    const newFiles: ScanNewFile[] = [];
    const candidates = (full ? found.map((f) => f.relPath) : diff.unknownPresent)
      .map((relPath) => foundByRelPath.get(relPath))
      .filter((f): f is FoundFile => f !== undefined);

    let done = 0;
    for (const file of candidates) {
      if (this.cancelRequested) {
        break; // scan partiel : l'UI présente ce qui a été analysé
      }
      onProgress?.({ done, total: candidates.length, current: file.relPath });

      // L'échec de ffprobe (fichier corrompu, outil absent) n'interrompt
      // pas le scan : la fiche restera qualifiable, sans infos techniques.
      let tech = null;
      try {
        tech = await probeFile(fromDriveRelative(driveRoot, file.relPath));
      } catch {
        tech = null;
      }

      // Fichier déjà indexé (mode complet) : sa fiche préremplit l'assistant.
      const knownMediaId = knownByRelPath.get(file.relPath)?.mediaId ?? null;

      newFiles.push({
        relPath: file.relPath,
        sizeBytes: file.sizeBytes,
        mtimeMs: file.mtimeMs,
        tech,
        guess: parseFilename(file.relPath),
        existing: knownMediaId === null ? null : this.loadExistingFiche(knownMediaId),
      });
      done += 1;
    }
    onProgress?.({ done, total: candidates.length, current: '' });

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
    //     (+ même durée quand les deux sont connues). Seuls les fichiers
    //     RÉELLEMENT inconnus participent (en scan complet, les fichiers
    //     déjà indexés ne sont pas des renommages). ---
    const relinkCandidates: ScanRelinkCandidate[] = [];
    for (const missing of missingRows) {
      const candidate = newFiles.find(
        (n) =>
          n.existing === null &&
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
      // Fichier déjà indexé (scan complet) : sa fiche existe, l'import .nfo
      // n'a pas de sens — il va directement à l'assistant (mise à jour).
      if (file.existing !== null) {
        toQualify.push(file);
        continue;
      }
      const nfo = await readMovieNfoFor(fromDriveRelative(driveRoot, file.relPath));
      if (nfo === null) {
        toQualify.push(file);
        continue;
      }
      try {
        const mediaId = this.createOrAttachMovie(this.nfoToQualifyInput(file, nfo));
        // Les images sidecar arrivées avec le dossier partagé sont
        // rattachées à la fiche — détection fs uniquement, hors ligne.
        this.applyImagePaths(
          mediaId,
          findExistingImages(fromDriveRelative(driveRoot, file.relPath)),
        );
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
    const videoAbsPath = fromDriveRelative(this.driveRoot(), input.relPath);

    // L'échec d'écriture du .nfo (dossier en lecture seule…) ne doit pas
    // annuler la qualification : la fiche est en base, le sidecar sera
    // réécrit à la prochaine édition.
    try {
      await writeMovieNfo(videoAbsPath, this.qualifyInputToNfo(input));
    } catch (error) {
      console.warn(`Écriture du .nfo impossible pour ${input.relPath} :`, error);
    }

    // Images sidecar : téléchargement TMDB si la fiche appliquée en
    // fournit (en ligne), sinon détection des images déjà présentes.
    // Jamais bloquant : l'image est un bonus visuel.
    const images = await ensureMovieImages(
      videoAbsPath,
      input.tmdbPosterPath,
      input.tmdbBackdropPath,
      this.fetchFn,
    );
    this.applyImagePaths(mediaId, images);

    return mediaId;
  }

  /**
   * Ré-enrichit une fiche EXISTANTE depuis des détails TMDB choisis par
   * l'utilisateur (bouton « Compléter via TMDB » de la page fiche).
   * Les champs PERSONNELS (tags, note) sont conservés ; le reste (titres,
   * synopsis, personnes, genres, trailer, images) vient de TMDB. Passe par
   * la même voie que la qualification : fiche + `.nfo` + images sidecar.
   * @returns faux si la fiche n'a pas de fichier rattaché (rien à faire)
   */
  async enrichMedia(mediaId: number, details: TmdbMovieDetails): Promise<boolean> {
    const file = this.db
      .select()
      .from(videoFiles)
      .where(eq(videoFiles.mediaId, mediaId))
      .orderBy(asc(videoFiles.partNumber))
      .get();
    const existing = this.loadExistingFiche(mediaId);
    if (file === undefined || existing === null) {
      return false;
    }

    await this.qualify({
      relPath: file.relPath,
      sizeBytes: file.sizeBytes,
      mtimeMs: file.mtimeMs,
      tech: {
        durationSec: file.durationSec,
        videoCodec: file.videoCodec,
        audioCodec: file.audioCodec,
        width: file.width,
        height: file.height,
      },
      partNumber: file.partNumber,
      titleVo: details.titleVo,
      titleVf: details.titleVf,
      year: details.year,
      overview: details.overview,
      // Champs personnels : jamais écrasés par TMDB.
      personalRating: existing.personalRating,
      tags: existing.tags,
      tmdbId: details.tmdbId,
      trailerYoutubeKey: details.trailerYoutubeKey,
      tmdbPosterPath: details.tmdbPosterPath,
      tmdbBackdropPath: details.tmdbBackdropPath,
      directors: details.directors,
      writers: details.writers,
      actors: details.actors,
      genres: details.genres,
    });
    return true;
  }

  /**
   * Enregistre en base les chemins (RELATIFS au lecteur) des images
   * sidecar d'une fiche — reflet exact de l'état du disque.
   */
  private applyImagePaths(mediaId: number, images: MovieImages): void {
    const driveRoot = this.driveRoot();
    this.db
      .update(media)
      .set({
        posterPath: images.poster === null ? null : toDriveRelative(driveRoot, images.poster),
        backdropPath: images.fanart === null ? null : toDriveRelative(driveRoot, images.fanart),
        updatedAt: Date.now(),
      })
      .where(eq(media.id, mediaId))
      .run();
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
      // --- Fichier DÉJÀ indexé (scan complet forcé) : MISE À JOUR de la
      //     fiche existante — jamais de doublon. Les relations sont
      //     remplacées intégralement (reflet exact de la saisie). ---
      const existingFile = tx
        .select({ id: videoFiles.id, mediaId: videoFiles.mediaId })
        .from(videoFiles)
        .where(eq(videoFiles.relPath, input.relPath))
        .get();
      if (existingFile !== undefined && existingFile.mediaId !== null) {
        const mediaId = existingFile.mediaId;
        tx.update(media)
          .set({
            titleVo: input.titleVo,
            titleVf: input.titleVf,
            year: input.year,
            overview: input.overview,
            personalRating: input.personalRating,
            tmdbId: input.tmdbId,
            trailerYoutubeKey: input.trailerYoutubeKey,
            updatedAt: Date.now(),
          })
          .where(eq(media.id, mediaId))
          .run();

        tx.delete(mediaPeople).where(eq(mediaPeople.mediaId, mediaId)).run();
        tx.delete(mediaGenres).where(eq(mediaGenres.mediaId, mediaId)).run();
        tx.delete(mediaTags).where(eq(mediaTags.mediaId, mediaId)).run();
        this.linkPeople(tx, mediaId, asActors(input.directors), 'director');
        this.linkPeople(tx, mediaId, asActors(input.writers), 'writer');
        this.linkPeople(tx, mediaId, input.actors, 'actor');
        this.linkGenres(tx, mediaId, input.genres);
        this.linkTags(tx, mediaId, input.tags);

        tx.update(videoFiles)
          .set({
            sizeBytes: input.sizeBytes,
            mtimeMs: input.mtimeMs,
            partNumber: input.partNumber,
            durationSec: input.tech?.durationSec ?? null,
            videoCodec: input.tech?.videoCodec ?? null,
            audioCodec: input.tech?.audioCodec ?? null,
            width: input.tech?.width ?? null,
            height: input.tech?.height ?? null,
            status: 'ok',
            scannedAt: Date.now(),
          })
          .where(eq(videoFiles.id, existingFile.id))
          .run();

        return mediaId;
      }

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
            trailerYoutubeKey: input.trailerYoutubeKey,
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

  /**
   * Charge la fiche existante d'un média pour préremplir l'assistant
   * (scan complet forcé) : champs + personnes par rôle + genres + tags.
   */
  private loadExistingFiche(mediaId: number): ExistingFiche | null {
    const m = this.db.select().from(media).where(eq(media.id, mediaId)).get();
    if (m === undefined) {
      return null;
    }

    const personRows = this.db
      .select({
        name: people.name,
        role: mediaPeople.role,
        character: mediaPeople.character,
      })
      .from(mediaPeople)
      .innerJoin(people, eq(people.id, mediaPeople.personId))
      .where(eq(mediaPeople.mediaId, mediaId))
      .orderBy(mediaPeople.sortOrder)
      .all();

    const genreRows = this.db
      .select({ name: genres.name })
      .from(mediaGenres)
      .innerJoin(genres, eq(genres.id, mediaGenres.genreId))
      .where(eq(mediaGenres.mediaId, mediaId))
      .all();

    const tagRows = this.db
      .select({ name: tags.name })
      .from(mediaTags)
      .innerJoin(tags, eq(tags.id, mediaTags.tagId))
      .where(eq(mediaTags.mediaId, mediaId))
      .all();

    return {
      mediaId,
      titleVo: m.titleVo,
      titleVf: m.titleVf,
      year: m.year,
      overview: m.overview,
      personalRating: m.personalRating,
      tmdbId: m.tmdbId,
      trailerYoutubeKey: m.trailerYoutubeKey,
      directors: personRows.filter((p) => p.role === 'director').map((p) => p.name),
      writers: personRows.filter((p) => p.role === 'writer').map((p) => p.name),
      actors: personRows
        .filter((p) => p.role === 'actor')
        .map((p) => ({ name: p.name, character: p.character })),
      genres: genreRows.map((g) => g.name),
      tags: tagRows.map((t) => t.name),
    };
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
      trailerYoutubeKey: nfo.trailerYoutubeKey,
      // Les images d'un dossier partagé sont déjà en sidecars : détection
      // fs uniquement, aucun téléchargement à l'import.
      tmdbPosterPath: null,
      tmdbBackdropPath: null,
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
      trailerYoutubeKey: input.trailerYoutubeKey,
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
