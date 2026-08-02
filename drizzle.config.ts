/**
 * Configuration drizzle-kit (génération des migrations SQL).
 * `pnpm db:generate` compare le schéma (electron/db/schema.ts) aux migrations
 * existantes et produit le SQL manquant dans electron/db/migrations —
 * dossier versionné, embarqué dans le build (resources/migrations).
 */
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './electron/db/schema.ts',
  out: './electron/db/migrations',
  dialect: 'sqlite',
});
