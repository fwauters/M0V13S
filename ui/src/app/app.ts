import { Component, inject } from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatIcon } from '@angular/material/icon';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { AdminLockService } from './core/services/admin-lock.service';
import { AppLang, LanguageService } from './core/services/language.service';
import { LibraryStore } from './core/library.store';
import { ThemeService } from './core/services/theme.service';

/**
 * Composant racine : header permanent (wordmark, navigation, langue,
 * thème) + router-outlet des features. Déclenche le contrôle de
 * conformité dès le démarrage (PLAN § 6.1).
 */
@Component({
  selector: 'app-root',
  imports: [
    TranslocoDirective,
    UpperCasePipe,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatIconButton,
    MatIcon,
    MatButtonToggleGroup,
    MatButtonToggle,
  ],
  templateUrl: './app.html',
})
export class App {
  /** Thème actif (signal) + bascule — voir ThemeService. */
  protected readonly theme = inject(ThemeService);

  /** Langue active (signal) + liste des langues — voir LanguageService. */
  protected readonly language = inject(LanguageService);

  /** Conformité (signal) : pilote l'affichage du lien « Bibliothèque ». */
  protected readonly store = inject(LibraryStore);

  /** Verrou admin (signal) : cadenas et outils admin du header. */
  protected readonly adminLock = inject(AdminLockService);

  constructor() {
    // Conformité vérifiée dès l'ouverture, sans bloquer le rendu :
    // l'accueil et le guard consommeront le résultat.
    void this.store.ensureConformity();
  }

  /** Relaye le choix de langue du sélecteur du header. */
  protected onLangChange(lang: AppLang): void {
    this.language.setLang(lang);
  }
}
