/**
 * Vue admin des tables — LECTURE SEULE (phase 1, outil de contrôle).
 *
 * Liste blanche stricte des tables exposées : le renderer ne peut pas
 * lire autre chose, et AUCUNE écriture ne passe par ici. Toute édition
 * (phase 5) passera par les services métier — jamais de SQL direct qui
 * contournerait la réécriture des `.nfo` (décision PLAN § 1).
 */
import { sql } from 'drizzle-orm';

import type { AdminTableData, AdminTableName } from '@shared/dto';
import type { AppDatabase } from '../db/client';

/** Tables autorisées (doit rester aligné avec AdminTableName). */
const ALLOWED_TABLES: ReadonlySet<AdminTableName> = new Set<AdminTableName>([
  'settings',
  'media',
  'seasons',
  'episodes',
  'video_files',
  'people',
  'media_people',
  'genres',
  'media_genres',
  'tags',
  'media_tags',
  'watch_state',
]);

/** Plafond de lignes retournées à la grille (les tables restent triables/filtrables côté UI). */
const MAX_ROWS = 5000;

export class AdminTablesService {
  constructor(private readonly db: AppDatabase) {}

  /** Contenu d'une table de la liste blanche (lecture seule). */
  readTable(table: AdminTableName): AdminTableData {
    if (!ALLOWED_TABLES.has(table)) {
      throw new Error(`Table non autorisée pour la vue admin : ${String(table)}`);
    }

    // Le nom vient de la liste blanche ci-dessus : l'interpolation via
    // sql.raw est donc sûre (jamais de saisie utilisateur ici).
    const rows = this.db.all<Record<string, unknown>>(
      sql`SELECT * FROM ${sql.raw(table)} LIMIT ${MAX_ROWS}`,
    );
    const count = this.db.get<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM ${sql.raw(table)}`,
    );

    return {
      columns: rows[0] !== undefined ? Object.keys(rows[0]) : this.columnsOf(table),
      rows,
      totalCount: count?.n ?? rows.length,
    };
  }

  /** Colonnes d'une table vide (PRAGMA — pour afficher les en-têtes). */
  private columnsOf(table: AdminTableName): string[] {
    const cols = this.db.all<{ name: string }>(
      sql`SELECT name FROM pragma_table_info(${table})`,
    );
    return cols.map((c) => c.name);
  }
}
