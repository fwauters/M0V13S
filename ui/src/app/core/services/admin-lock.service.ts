import { Injectable, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';

/**
 * État du VERROU ADMIN côté UI (PLAN § 6.6). Le mode admin protège :
 * scan, réglages TMDB, édition des fiches, vue données, MAJ VLC.
 *
 * - Verrouillé par défaut à CHAQUE lancement dès qu'un mot de passe
 *   existe ; tant qu'aucun n'est défini (app pas encore configurée),
 *   tout reste ouvert — l'écran de premier lancement en proposera un.
 * - Déverrouillage : naviguer vers une fonction admin (Scanner, vue
 *   données) — le guard ouvre le dialogue de mot de passe. Décision
 *   utilisateur (phase 5) : PAS de combo clavier — le mot de passe
 *   suffit, le dialogue arrive naturellement par la navigation.
 * - Re-verrouillage : le cadenas du header (visible seulement une fois
 *   déverrouillé).
 */
@Injectable({ providedIn: 'root' })
export class AdminLockService {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);

  private readonly _unlocked = signal(false);
  /** Vrai si le mode admin est accessible (signal). */
  readonly unlocked = this._unlocked.asReadonly();

  /** Une seule invite à la fois (deux guards peuvent se croiser). */
  private prompting: Promise<boolean> | null = null;

  constructor() {
    // Sans mot de passe défini, le mode admin reste ouvert.
    void this.api.hasAdminPassword().then((has) => {
      if (!has) {
        this._unlocked.set(true);
      }
    });
  }

  /** Re-verrouille immédiatement (cadenas du header). */
  lock(): void {
    this._unlocked.set(false);
  }

  /**
   * Garantit le déverrouillage : déjà ouvert → vrai ; sinon ouvre le
   * dialogue de mot de passe (une seule invite simultanée).
   * @returns vrai si le mode admin est accessible à l'issue
   */
  async requestUnlock(): Promise<boolean> {
    if (this._unlocked()) {
      return true;
    }
    this.prompting ??= this.promptPassword().finally(() => {
      this.prompting = null;
    });
    return this.prompting;
  }

  /** Ouvre le dialogue et applique le résultat. */
  private async promptPassword(): Promise<boolean> {
    // Import paresseux : le dialogue vit dans features/admin.
    const { AdminUnlockDialog } = await import(
      '../../features/admin/admin-unlock-dialog'
    );
    const unlocked = await firstValueFrom(
      this.dialog.open<unknown, void, boolean>(AdminUnlockDialog).afterClosed(),
    );
    if (unlocked === true) {
      this._unlocked.set(true);
      return true;
    }
    return false;
  }
}
