/**
 * Vitest — tests du backend (main process) et des règles transverses.
 * Les tests de l'UI Angular ont leur propre runner (`pnpm test:ui`,
 * builder @angular/build:unit-test) ; ici on couvre :
 * - la logique pure du main process (electron/**\/*.spec.ts) ;
 * - le contrat partagé (shared/**\/*.spec.ts) ;
 * - les règles projet transverses (tests/**\/*.spec.ts), ex. complétude i18n.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'electron/**/*.spec.ts',
      'shared/**/*.spec.ts',
      'tests/**/*.spec.ts',
    ],
  },
});
