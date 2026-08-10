/**
 * Lecture VLC (PLAN § 6.3) — spawn du VLC portable embarqué (`tools\vlc`)
 * et suivi de la position via son interface HTTP locale.
 *
 * Déroulé d'une lecture :
 * 1. `play(mediaId, resume)` : premier fichier présent de la fiche,
 *    port HTTP libre choisi dynamiquement, mot de passe jetable, spawn ;
 * 2. polling de `/requests/status.json` (2 s) : position mémorisée,
 *    reprise sauvegardée en continu (un crash ne perd presque rien),
 *    « vu » enregistré dès 90 % de la durée ;
 * 3. sortie du process : état finalisé + notification `onEnded` (l'IPC
 *    la relaie au renderer pour rafraîchir l'UI).
 *
 * Une seule lecture à la fois (l'app est mono-utilisateur) ; toutes les
 * dépendances d'environnement (spawn, fetch, chemins, port) sont
 * injectables — les tests pilotent un faux process et de faux statuts.
 */
import { ChildProcess, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';

import type { PlayOutcome } from '@shared/dto';
import { and, asc, eq } from 'drizzle-orm';

import type { AppDatabase } from '../db/client';
import { videoFiles } from '../db/schema';
import { fromDriveRelative } from './paths.logic';
import { getDriveRoot, getVlcPath } from './paths.service';
import {
  authHeader,
  buildVlcArgs,
  isCompleted,
  parseVlcStatus,
  resumeToSave,
  statusUrl,
} from './vlc.logic';
import type { WatchService } from './watch.service';

/** Lecture en cours (une seule à la fois). */
interface PlaybackSession {
  mediaId: number;
  child: ChildProcess;
  poller: ReturnType<typeof setInterval>;
  password: string;
  port: number;
  /** Dernière position/durée connues (finalisation à la sortie). */
  lastPositionSec: number | null;
  lastDurationSec: number | null;
  /** Vrai dès que le seuil des 90 % a été franchi (enregistré une fois). */
  completed: boolean;
}

/** Dépendances injectables (tests : faux spawn/fetch/chemins/port). */
export interface VlcServiceDeps {
  spawnFn?: typeof spawn;
  fetchFn?: typeof fetch;
  vlcPath?: () => string;
  driveRoot?: () => string;
  findFreePort?: () => Promise<number>;
  /** Période de polling (ms) — raccourcie dans les tests. */
  pollIntervalMs?: number;
}

/** Trouve un port TCP libre en le faisant attribuer par l'OS (bind :0). */
function osAssignedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('port introuvable'));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

export class VlcService {
  private readonly spawnFn: typeof spawn;
  private readonly fetchFn: typeof fetch;
  private readonly vlcPath: () => string;
  private readonly driveRoot: () => string;
  private readonly findFreePort: () => Promise<number>;
  private readonly pollIntervalMs: number;

  /** Session de lecture courante (null au repos). */
  private session: PlaybackSession | null = null;

  /** Écouteurs de fin de lecture (relayés au renderer par l'IPC). */
  private readonly endedListeners = new Set<(mediaId: number) => void>();

  constructor(
    private readonly db: AppDatabase,
    private readonly watch: WatchService,
    deps: VlcServiceDeps = {},
  ) {
    this.spawnFn = deps.spawnFn ?? spawn;
    this.fetchFn = deps.fetchFn ?? fetch;
    this.vlcPath = deps.vlcPath ?? getVlcPath;
    this.driveRoot = deps.driveRoot ?? getDriveRoot;
    this.findFreePort = deps.findFreePort ?? osAssignedPort;
    this.pollIntervalMs = deps.pollIntervalMs ?? 2000;
  }

  /** S'abonne à la fin de lecture ; retourne la désinscription. */
  onEnded(listener: (mediaId: number) => void): () => void {
    this.endedListeners.add(listener);
    return () => this.endedListeners.delete(listener);
  }

  /**
   * Lance la lecture du premier fichier présent de la fiche.
   * @param resume vrai = reprendre à la position sauvegardée (ignoré
   *               s'il n'y en a pas)
   */
  async play(mediaId: number, resume: boolean): Promise<PlayOutcome> {
    if (this.session !== null) {
      return { status: 'alreadyPlaying' };
    }
    if (!fs.existsSync(this.vlcPath())) {
      return { status: 'vlcMissing' };
    }

    // Premier fichier PRÉSENT (status ok), ordre des parties.
    const file = this.db
      .select({ relPath: videoFiles.relPath })
      .from(videoFiles)
      .where(and(eq(videoFiles.mediaId, mediaId), eq(videoFiles.status, 'ok')))
      .orderBy(asc(videoFiles.partNumber))
      .get();
    if (file === undefined) {
      return { status: 'fileMissing' };
    }
    const absPath = fromDriveRelative(this.driveRoot(), file.relPath);
    if (!fs.existsSync(absPath)) {
      return { status: 'fileMissing' };
    }

    const startTimeSec = resume
      ? (this.watch.getInfo(mediaId).resumePositionSec ?? 0)
      : 0;

    try {
      const port = await this.findFreePort();
      const password = crypto.randomBytes(12).toString('hex');
      const child = this.spawnFn(
        this.vlcPath(),
        buildVlcArgs(absPath, { port, password, startTimeSec }),
        { stdio: 'ignore', windowsHide: false },
      );

      const session: PlaybackSession = {
        mediaId,
        child,
        password,
        port,
        lastPositionSec: startTimeSec > 0 ? startTimeSec : null,
        lastDurationSec: null,
        completed: false,
        poller: setInterval(() => void this.poll(), this.pollIntervalMs),
      };
      this.session = session;

      child.on('error', () => this.finalize(session));
      child.on('exit', () => this.finalize(session));
      return { status: 'ok' };
    } catch {
      return { status: 'error' };
    }
  }

  /**
   * Un tick de polling : lit le statut VLC et met le watch_state à jour.
   * Toute erreur est ignorée (interface HTTP pas encore prête, VLC en
   * train de se fermer…) — le tick suivant réessaiera.
   */
  private async poll(): Promise<void> {
    const session = this.session;
    if (session === null) {
      return;
    }
    try {
      const response = await this.fetchFn(statusUrl(session.port), {
        headers: { Authorization: authHeader(session.password) },
      });
      if (!response.ok) {
        return;
      }
      const status = parseVlcStatus(await response.text());
      if (status === null) {
        return;
      }
      if (status.timeSec !== null) {
        session.lastPositionSec = status.timeSec;
      }
      if (status.lengthSec !== null) {
        session.lastDurationSec = status.lengthSec;
      }

      if (!session.completed && isCompleted(session.lastPositionSec, session.lastDurationSec)) {
        // > 90 % : vu — enregistré UNE fois par session de lecture.
        session.completed = true;
        this.watch.registerCompletion(session.mediaId);
      } else if (!session.completed) {
        // Reprise sauvegardée en continu : un crash ne perd presque rien.
        this.watch.saveResume(
          session.mediaId,
          resumeToSave(session.lastPositionSec, session.lastDurationSec),
        );
      }
    } catch {
      // Réseau local pas prêt : silencieux, prochain tick.
    }
  }

  /** Fin de lecture : arrêt du polling, état final, notification. */
  private finalize(session: PlaybackSession): void {
    if (this.session !== session) {
      return; // déjà finalisée (exit + error peuvent tous deux arriver)
    }
    clearInterval(session.poller);
    this.session = null;
    if (!session.completed) {
      this.watch.saveResume(
        session.mediaId,
        resumeToSave(session.lastPositionSec, session.lastDurationSec),
      );
    }
    for (const listener of this.endedListeners) {
      listener(session.mediaId);
    }
  }
}
