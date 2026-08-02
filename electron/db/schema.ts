/**
 * Schéma Drizzle de la base SQLite.
 *
 * Phase 0 : uniquement la table `settings` (préférences clé/valeur), qui sert
 * aussi de preuve de vie de la chaîne DB. Le schéma complet films + séries
 * (PLAN § 5) arrive en phase 1 (TODO 1.1) via de nouvelles migrations.
 *
 * Rappel : tout changement ici passe par une migration versionnée
 * (`pnpm db:generate`) — jamais de modification de schéma à la main.
 */
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Préférences et état de l'application (clé/valeur).
 * Contiendra notamment : clé API TMDB, hash du mot de passe admin, racines
 * de bibliothèque (chemins RELATIFS), thème, langue.
 */
export const settings = sqliteTable('settings', {
  /** Nom de la préférence, en notation pointée (ex. `ui.theme`). */
  key: text('key').primaryKey(),
  /** Valeur sérialisée en texte (JSON si structurée). */
  value: text('value').notNull(),
});
