import { Injectable, Signal, signal } from '@angular/core';

/** Les deux thèmes de l'app (décision CLAUDE.md « Thèmes »). */
export type AppTheme = 'light' | 'dark';

/** Clé de persistance temporaire (localStorage).
 *  TODO(phase 1) : migrer vers la table `settings` (SQLite) via IPC. */
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
  private readonly _theme = signal<AppTheme>(resolveInitialTheme());

  /** Thème actif, exposé en lecture seule pour les composants. */
  readonly theme: Signal<AppTheme> = this._theme.asReadonly();

  constructor() {
    // Applique le thème initial dès la construction du service.
    this.apply(this._theme());
  }

  /** Bascule light <-> dark (bouton du header). */
  toggle(): void {
    this.setTheme(this._theme() === 'dark' ? 'light' : 'dark');
  }

  /** Fixe un thème explicite et persiste le choix. */
  setTheme(theme: AppTheme): void {
    this._theme.set(theme);
    localStorage.setItem(STORAGE_KEY, theme);
    this.apply(theme);
  }

  /** Propage le thème aux deux systèmes de style (Material + Tailwind). */
  private apply(theme: AppTheme): void {
    const root = document.documentElement;
    root.style.colorScheme = theme; // Material (light-dark())
    root.classList.toggle('dark', theme === 'dark'); // Tailwind (dark:)
  }
}
