import { Injectable, Signal, inject, signal } from '@angular/core';

import { ApiService } from './api.service';

/** Les deux thèmes de l'app (décision CLAUDE.md « Thèmes »). */
export type AppTheme = 'light' | 'dark';

/**
 * Cache localStorage : évite un flash de mauvais thème au démarrage
 * (appliqué immédiatement, avant la réponse IPC). La source de vérité
 * durable est la table `settings` (clé `ui.theme`), qui voyage avec le
 * disque — le localStorage n'est qu'un miroir local par machine.
 */
const STORAGE_KEY = 'm0v13s.theme';

/**
 * Thème de démarrage : le choix explicite persisté s'il existe,
 * sinon la préférence du système d'exploitation.
 */
function resolveInitialTheme(): AppTheme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  // `matchMedia` peut manquer dans certains environnements de test (jsdom) :
  // repli sur le thème clair dans ce cas.
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)');
  return prefersDark?.matches ? 'dark' : 'light';
}

/**
 * Source de vérité UNIQUE du thème. Un seul signal pilote les deux systèmes
 * de style (voir styles.scss et tailwind.css) :
 * - Angular Material : propriété CSS `color-scheme` sur <html>
 *   (les tokens M3 sont émis en `light-dark()`) ;
 * - Tailwind : classe `.dark` sur <html> (variante `dark:`).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly api = inject(ApiService);

  private readonly _theme = signal<AppTheme>(resolveInitialTheme());

  /** Thème actif, exposé en lecture seule pour les composants. */
  readonly theme: Signal<AppTheme> = this._theme.asReadonly();

  constructor() {
    // Applique immédiatement le thème du cache local (pas de flash),
    // puis se resynchronise sur la valeur durable de la DB (le disque
    // peut avoir été utilisé sur une autre machine entre-temps).
    this.apply(this._theme());
    void this.restoreFromSettings();
  }

  /** Bascule light <-> dark (bouton du header). */
  toggle(): void {
    this.setTheme(this._theme() === 'dark' ? 'light' : 'dark');
  }

  /** Fixe un thème explicite et persiste le choix (DB + cache local). */
  setTheme(theme: AppTheme): void {
    this._theme.set(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    void this.api.setSetting('ui.theme', theme);
    this.apply(theme);
  }

  /** Aligne le thème sur la valeur persistée en DB, si elle existe. */
  private async restoreFromSettings(): Promise<void> {
    const stored = await this.api.getSetting('ui.theme');
    if ((stored === 'light' || stored === 'dark') && stored !== this._theme()) {
      this._theme.set(stored);
      localStorage.setItem(STORAGE_KEY, stored);
      this.apply(stored);
    }
  }

  /** Propage le thème aux deux systèmes de style (Material + Tailwind). */
  private apply(theme: AppTheme): void {
    const root = document.documentElement;
    root.style.colorScheme = theme; // Material (light-dark())
    root.classList.toggle('dark', theme === 'dark'); // Tailwind (dark:)
  }
}
