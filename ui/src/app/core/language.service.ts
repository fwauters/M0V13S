import { Injectable, Signal, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { ApiService } from './api.service';

/** Langues disponibles dans l'UI. Ajouter une langue = étendre cette liste
 *  (+ le JSON et l'import dans transloco-static.loader.ts). */
export const APP_LANGS = ['fr', 'en'] as const;
export type AppLang = (typeof APP_LANGS)[number];

/**
 * Cache localStorage : langue appliquée immédiatement au démarrage, avant
 * la réponse IPC. La source de vérité durable est la table `settings`
 * (clé `ui.lang`), qui voyage avec le disque.
 */
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
  private readonly api = inject(ApiService);

  private readonly _lang = signal<AppLang>(resolveInitialLang());

  /** Langue active, exposée en lecture seule pour les composants. */
  readonly lang: Signal<AppLang> = this._lang.asReadonly();

  /** Langues proposées (pour construire les sélecteurs d'UI). */
  readonly availableLangs = APP_LANGS;

  constructor() {
    // Langue du cache local tout de suite, puis resynchronisation sur la
    // valeur durable de la DB (le disque voyage entre machines).
    this.apply(this._lang());
    void this.restoreFromSettings();
  }

  /** Change la langue active et persiste le choix (DB + cache local). */
  setLang(lang: AppLang): void {
    this._lang.set(lang);
    localStorage.setItem(STORAGE_KEY, lang);
    void this.api.setSetting('ui.lang', lang);
    this.apply(lang);
  }

  /** Aligne la langue sur la valeur persistée en DB, si elle existe. */
  private async restoreFromSettings(): Promise<void> {
    const stored = await this.api.getSetting('ui.lang');
    if (
      stored !== null &&
      (APP_LANGS as readonly string[]).includes(stored) &&
      stored !== this._lang()
    ) {
      const lang = stored as AppLang;
      this._lang.set(lang);
      localStorage.setItem(STORAGE_KEY, lang);
      this.apply(lang);
    }
  }

  /** Propage la langue à Transloco et au document. */
  private apply(lang: AppLang): void {
    this.transloco.setActiveLang(lang);
    document.documentElement.lang = lang;
  }
}
