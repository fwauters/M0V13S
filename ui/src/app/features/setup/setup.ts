import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiService } from '../../core/services/api.service';
import { LibraryStore } from '../../core/library.store';

/**
 * Écran de PREMIER LANCEMENT (phase 5) : trois réglages sur une page —
 * racines de bibliothèque (indispensables), clé TMDB (optionnelle,
 * l'app fonctionne sans), mot de passe admin (optionnel, recommandé).
 * « Terminer » marque l'app configurée (`app.setupDone`) et rejoint
 * l'accueil ; tout reste modifiable ensuite (accueil / mode admin).
 */
@Component({
  selector: 'app-setup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslocoDirective,
    FormsModule,
    MatButton,
    MatIconButton,
    MatFormField,
    MatHint,
    MatLabel,
    MatInput,
    MatIcon,
  ],
  templateUrl: './setup.html',
  // Relaye la chaîne flex du layout (voir admin-data.ts pour le pourquoi).
  host: { class: 'flex grow flex-col' },
})
export class Setup {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly store = inject(LibraryStore);

  /* ------------------ 1. racines de bibliothèque ------------------ */

  /** Racines choisies (mêmes règles que le mode Scanner). */
  protected readonly roots = signal<string[]>([]);
  protected rootDraft = '';
  protected readonly rootInvalid = signal(false);

  /** Ajoute une racine (normalisée, lettre de lecteur interdite). */
  protected addRoot(): void {
    const value = this.rootDraft
      .trim()
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '');
    if (/^[a-zA-Z]:/.test(value)) {
      this.rootInvalid.set(true);
      return;
    }
    this.rootInvalid.set(false);
    if (value !== '' && !this.roots().includes(value)) {
      this.roots.update((r) => [...r, value]);
    }
    this.rootDraft = '';
  }

  protected removeRoot(root: string): void {
    this.roots.update((r) => r.filter((x) => x !== root));
  }

  /* ------------------------ 2. clé TMDB --------------------------- */

  protected tmdbKeyDraft = '';

  /* ------------------- 3. mot de passe admin ---------------------- */

  protected passwordDraft = '';
  protected passwordConfirm = '';
  /** Les deux saisies ne correspondent pas. */
  protected readonly passwordMismatch = signal(false);

  /** Enregistrement en cours (désactive le bouton). */
  protected readonly saving = signal(false);

  /**
   * Applique les trois réglages puis marque l'app configurée.
   * La clé TMDB et le mot de passe sont optionnels ; les racines
   * peuvent aussi être définies plus tard dans le mode Scanner.
   */
  protected async finish(): Promise<void> {
    if (this.passwordDraft !== this.passwordConfirm) {
      this.passwordMismatch.set(true);
      return;
    }
    this.passwordMismatch.set(false);
    this.saving.set(true);
    try {
      if (this.roots().length > 0) {
        await this.api.setLibraryRoots(this.roots());
      }
      const tmdbKey = this.tmdbKeyDraft.trim();
      if (tmdbKey !== '') {
        await this.api.setTmdbKey(tmdbKey);
      }
      if (this.passwordDraft.trim() !== '') {
        await this.api.setAdminPassword(this.passwordDraft, null);
      }
      await this.api.setSetting('app.setupDone', '1');
      // La conformité dépend des racines fraîchement posées.
      await this.store.refreshConformity();
      await this.router.navigateByUrl('/');
    } finally {
      this.saving.set(false);
    }
  }
}
