import { Component, inject, signal } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { MatIcon } from '@angular/material/icon';
import { UpperCasePipe } from '@angular/common';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiService } from './core/api.service';
import { AppLang, LanguageService } from './core/language.service';
import { ThemeService } from './core/theme.service';

/**
 * Composant racine : shell de l'application.
 * En phase 0 il sert de démonstrateur des piliers du socle : thèmes
 * light/dark, i18n à chaud, Material + Tailwind, et l'aller-retour IPC
 * complet (UI -> preload -> main -> SQLite). Le routing des features
 * (home, browse, scan…) arrive en phase 1.
 */
@Component({
  selector: 'app-root',
  imports: [
    TranslocoDirective,
    UpperCasePipe,
    MatButton,
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

  private readonly api = inject(ApiService);

  /** Appel de ping en cours (désactive le bouton). */
  protected readonly pingPending = signal(false);

  /** Résumé lisible du dernier ping réussi (null tant qu'aucun). */
  protected readonly pingSummary = signal<string | null>(null);

  /** Vrai si le dernier ping a constaté l'absence du backend (hors Electron). */
  protected readonly pingUnavailable = signal(false);

  /** Relaye le choix de langue du sélecteur du header. */
  protected onLangChange(lang: AppLang): void {
    this.language.setLang(lang);
  }

  /** Démonstration IPC : ping du backend et affichage du résultat. */
  protected async onPing(): Promise<void> {
    this.pingPending.set(true);
    this.pingUnavailable.set(false);
    try {
      const result = await this.api.pingSystem();
      if (result === null) {
        this.pingSummary.set(null);
        this.pingUnavailable.set(true);
        return;
      }
      // Données techniques (non traduites) ; le libellé autour est traduit.
      this.pingSummary.set(
        `v${result.appVersion} · Electron ${result.electronVersion} · ` +
          `Node ${result.nodeVersion} · DB ${result.dbOk ? 'OK' : 'KO'}`,
      );
    } finally {
      this.pingPending.set(false);
    }
  }
}
