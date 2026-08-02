import { Injectable, Signal, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

/** Langues disponibles dans l'UI. Ajouter une langue = étendre cette liste
 *  (+ le JSON et l'import dans transloco-static.loader.ts). */
export const APP_LANGS = ['fr', 'en'] as const;
export type AppLang = (typeof APP_LANGS)[number];

/** Clé de persistance temporaire (localStorage).
 *  TODO(phase 1) : migrer vers la table `settings` (SQLite) via IPC. */
const STORAGE_KEY = 'm0v13s.lang';

/**
 * Détermine la langue de démarrage, par priorité :
 * 1. le choix explicite persisté ;
 * 2. la langue du système si on la propose (fr/en) ;
 * 3. l'anglais en dernier recours (décision PLAN § 6.6).
 */
function resolveInitialLang(): AppLang {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && (APP_LANGS as readonly string[]).includes(stored)) {
    return stored as AppLang;
  }
  const system = navigator.language.slice(0, 2).toLowerCase();
  return (APP_LANGS as readonly string[]).includes(system) ? (system as AppLang) : 'en';
}

/**
 * Source de vérité de la langue active de l'UI.
 * Pilote Transloco (traductions) et l'attribut `lang` de <html>
 * (accessibilité / correcteurs). Changement à chaud, sans rechargement.
 */
@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);

  private readonly _lang = signal<AppLang>(resolveInitialLang());

  /** Langue active, exposée en lecture seule pour les composants. */
  readonly lang: Signal<AppLang> = this._lang.asReadonly();

  /** Langues proposées (pour construire les sélecteurs d'UI). */
  readonly availableLangs = APP_LANGS;

  constructor() {
    // Applique la langue initiale dès la construction du service.
    this.apply(this._lang());
  }

  /** Change la langue active et persiste le choix. */
  setLang(lang: AppLang): void {
    this._lang.set(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    this.apply(lang);
  }

  /** Propage la langue à Transloco et au document. */
  private apply(lang: AppLang): void {
    this.transloco.setActiveLang(lang);
    document.documentElement.lang = lang;
  }
}
