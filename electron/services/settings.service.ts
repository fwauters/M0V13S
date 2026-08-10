/**
 * Réglages de l'application — accès typé à la table `settings` (clé/valeur).
 *
 * Contenu attendu : préférences d'UI (thème, langue), racines de
 * bibliothèque (chemins RELATIFS au lecteur), clé API TMDB (phase 2),
 * hash du mot de passe admin (phase 5). Les valeurs structurées sont
 * stockées en JSON.
 */
import { eq } from 'drizzle-orm';

import type { AppDatabase } from '../db/client';
import { settings } from '../db/schema';

/** Clés de réglage connues — seule liste autorisée en lecture/écriture. */
export type SettingKey =
  | 'ui.theme'
  | 'ui.lang'
  | 'library.roots'
  | 'tmdb.apiKey'
  | 'tmdb.language'
  | 'tmdb.trailerLanguage'
  | 'admin.passwordHash'
  | 'app.setupDone';

/** Service d'accès aux réglages (une instance par DB ouverte). */
export class SettingsService {
  constructor(private readonly db: AppDatabase) {}

  /** Valeur brute d'un réglage, ou null s'il n'a jamais été écrit. */
  get(key: SettingKey): string | null {
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get();
    return row?.value ?? null;
  }

  /** Écrit (ou remplace) un réglage — upsert atomique côté SQLite. */
  set(key: SettingKey, value: string): void {
    this.db
      .insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value } })
      .run();
  }

  /** Variante JSON : retourne `fallback` si absent ou illisible. */
  getJson<T>(key: SettingKey, fallback: T): T {
    const raw = this.get(key);
    if (raw === null) {
      return fallback;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Valeur corrompue : on repart du défaut plutôt que de planter —
      // la DB n'est qu'un index reconstructible.
      return fallback;
    }
  }

  /** Variante JSON en écriture. */
  setJson(key: SettingKey, value: unknown): void {
    this.set(key, JSON.stringify(value));
  }

  /** Racines de bibliothèque (chemins relatifs au lecteur, séparateurs /). */
  getLibraryRoots(): string[] {
    return this.getJson<string[]>('library.roots', []);
  }

  /** Remplace la liste des racines de bibliothèque. */
  setLibraryRoots(roots: string[]): void {
    this.setJson('library.roots', roots);
  }
}
