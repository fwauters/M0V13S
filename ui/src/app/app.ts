import { Component, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatIcon } from '@angular/material/icon';
import { UpperCasePipe } from '@angular/common';
import { TranslocoDirective } from '@jsverse/transloco';

import { AppLang, LanguageService } from './core/language.service';
import { ThemeService } from './core/theme.service';

/**
 * Composant racine : shell de l'application.
 * En phase 0 il sert de démonstrateur des piliers du socle :
 * thèmes light/dark, i18n à chaud, Material + Tailwind côte à côte.
 * Le routing des features (home, browse, scan…) arrive en phase 1.
 */
@Component({
  selector: 'app-root',
  imports: [TranslocoDirective, UpperCasePipe, MatIconButton, MatIcon, MatButtonToggleGroup, MatButtonToggle],
  templateUrl: './app.html',
})
export class App {
  /** Thème actif (signal) + bascule — voir ThemeService. */
  protected readonly theme = inject(ThemeService);

  /** Langue active (signal) + liste des langues — voir LanguageService. */
  protected readonly language = inject(LanguageService);

  /** Relaye le choix de langue du sélecteur du header. */
  protected onLangChange(lang: AppLang): void {
    this.language.setLang(lang);
  }
}
