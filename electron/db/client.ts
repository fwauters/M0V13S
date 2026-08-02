/**
 * Ouverture de la base SQLite (better-sqlite3) + ORM Drizzle + migrations.
 *
 * better-sqlite3 v13 est un module N-API : ses binaires précompilés
 * fonctionnent tels quels sous Node ET sous Electron — aucun rebuild natif.
 * Les migrations Drizzle (SQL versionné) sont appliquées à CHAQUE démarrage :
 * une DB absente est créée, une DB en retard est mise à niveau — c'est ce qui
 * permet à la base d'être un simple index reconstructible (PLAN, principe 2).
 */
import Database from 'better-sqlite3';
import { BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

import * as schema from './schema';

/** Type de la DB applicative, avec le schéma complet attaché. */
export type AppDatabase = BetterSQLite3Database<typeof schema>;

/** Handle retourné à l'ouverture : la DB + sa fermeture propre. */
export interface AppDatabaseHandle {
  db: AppDatabase;
  /** Ferme la connexion sous-jacente (flush du WAL) — à appeler à la
   *  sortie de l'app et dans les tests avant suppression du fichier. */
  close(): void;
}

/**
 * Ouvre (ou crée) la base au chemin donné et applique les migrations.
 * @param dbPath chemin absolu du fichier .db (résolu par paths.service)
 * @param migrationsDir dossier des migrations SQL (résolu par paths.service)
 */
export function openDatabase(dbPath: string, migrationsDir: string): AppDatabaseHandle {
  const sqlite = new Database(dbPath);
  // WAL : lectures concurrentes + robustesse aux coupures — adapté à un
  // disque externe qui peut être débranché.
  sqlite.pragma('journal_mode = WAL');
  // SQLite n'applique PAS les clés étrangères par défaut : indispensable
  // pour nos suppressions en cascade (fiche -> fichiers/jonctions/état).
  sqlite.pragma('foreign_keys = ON');

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsDir });
  return { db, close: () => sqlite.close() };
}
