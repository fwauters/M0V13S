/**
 * Suivi de visionnage (`watch_state`) — PERSONNEL par principe :
 * DB locale uniquement, JAMAIS exporté dans les `.nfo` (CLAUDE.md).
 *
 * Alimenté par deux sources :
 * - la lecture VLC (vlc.service) : reprise sauvegardée en continu,
 *   « vu » automatique à > 90 % de la durée ;
 * - l'utilisateur : marquage manuel vu / pas vu depuis la fiche.
 */
import { eq } from 'drizzle-orm';

import type { WatchStateInfo } from '@shared/dto';
import type { AppDatabase } from '../db/client';
import { watchState } from '../db/schema';

export class WatchService {
  constructor(private readonly db: AppDatabase) {}

  /** État de visionnage d'un film (zéros si jamais lu). */
  getInfo(mediaId: number): WatchStateInfo {
    const row = this.db
      .select()
      .from(watchState)
      .where(eq(watchState.mediaId, mediaId))
      .get();
    return {
      completed: row?.completed ?? false,
      watchCount: row?.watchCount ?? 0,
      resumePositionSec: row?.resumePositionSec ?? null,
      lastWatchedAt: row?.lastWatchedAt ?? null,
    };
  }

  /**
   * Sauvegarde la position de reprise (appelée en continu pendant la
   * lecture, et en fin de lecture non terminée). Ne touche ni au
   * compteur ni au drapeau « vu » : revoir un film déjà vu conserve
   * son historique. `lastWatchedAt` est rafraîchi : c'est la DERNIÈRE
   * ACTIVITÉ de lecture (tri de la rangée « Reprendre », phase 5) —
   * pas seulement le dernier visionnage complet.
   */
  saveResume(mediaId: number, positionSec: number | null): void {
    this.upsert(mediaId, { resumePositionSec: positionSec, lastWatchedAt: Date.now() });
  }

  /**
   * Enregistre un visionnage COMPLET (position > 90 % — vlc.service) :
   * vu, compteur incrémenté, date mise à jour, reprise effacée.
   */
  registerCompletion(mediaId: number): void {
    const current = this.getInfo(mediaId);
    this.upsert(mediaId, {
      completed: true,
      watchCount: current.watchCount + 1,
      lastWatchedAt: Date.now(),
      resumePositionSec: null,
    });
  }

  /**
   * Marquage MANUEL vu / pas vu (fiche). Dans les deux sens, la reprise
   * est effacée (décision : « pas vu » = repartir de zéro). Marquer vu
   * garantit un compteur d'au moins 1 ; démarquer conserve l'historique.
   * @returns le nouvel état
   */
  setCompleted(mediaId: number, completed: boolean): WatchStateInfo {
    const current = this.getInfo(mediaId);
    this.upsert(mediaId, {
      completed,
      watchCount: completed ? Math.max(current.watchCount, 1) : current.watchCount,
      lastWatchedAt: completed ? Date.now() : current.lastWatchedAt,
      resumePositionSec: null,
    });
    return this.getInfo(mediaId);
  }

  /** Upsert par mediaId (index unique — un seul état par film). */
  private upsert(
    mediaId: number,
    values: Partial<{
      completed: boolean;
      watchCount: number;
      lastWatchedAt: number | null;
      resumePositionSec: number | null;
    }>,
  ): void {
    const existing = this.db
      .select({ id: watchState.id })
      .from(watchState)
      .where(eq(watchState.mediaId, mediaId))
      .get();
    if (existing === undefined) {
      this.db.insert(watchState).values({ mediaId, ...values }).run();
    } else {
      this.db.update(watchState).set(values).where(eq(watchState.id, existing.id)).run();
    }
  }
}
