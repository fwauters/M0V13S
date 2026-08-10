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
 * - Déverrouillage : combo clavier Ctrl+Alt+A (obfuscation assumée —
 *   rien de visible tant que c'est verrouillé), ou toute navigation
 *   vers une route admin (le guard ouvre le dialogue).
 * - Re-verrouillage : le cadenas du header (visible seulement une fois
 *   déverrouillé) ou le même combo.
 */
@Injectable({ providedIn: 'root' })
export class AdminLockService {
  private readonly api = inject(ApiService);
  private readonly dialog = inject(MatDialog);

  private readonly _unlocked = signal(false);
  /** Vrai si le mode admin est accessible (signal). */
  readonly unlocked = this._unlocked.asReadonly();

  /** Une seule invite à la fois (combo + guard peuvent se croiser). */
  private prompting: Promise<boolean> | null = null;

  constructor() {
    // Sans mot de passe défini, le mode admin reste ouvert.
    void this.api.hasAdminPassword().then((has) => {
      if (!has) {
        this._unlocked.set(true);
      }
    });

    // Combo global Ctrl+Alt+A : déverrouille (invite) ou re-verrouille.
    window.addEventListener('keydown', (event) => {
      if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        if (this._unlocked()) {
          this.lock();
        } else {
          void this.requestUnlock();
        }
      }
    });
  }

  /** Re-verrouille immédiatement (cadenas du header, combo). */
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
