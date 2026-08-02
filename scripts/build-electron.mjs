/**
 * Bundle le main process et le preload avec esbuild.
 *
 * Sorties : dist-electron/main.cjs et dist-electron/preload.cjs (CommonJS —
 * format le plus robuste pour Electron, y compris le preload sandboxé).
 * Externes : `electron` (fourni par le runtime) et `better-sqlite3`
 * (module natif, résolu dans node_modules au run).
 *
 * Usage :
 *   node scripts/build-electron.mjs           # build unique
 *   node scripts/build-electron.mjs --watch   # rebuild à chaque changement (dev)
 */
import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: {
    main: 'electron/main.ts',
    preload: 'electron/preload.ts',
  },
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  sourcemap: true,
  // L'alias @shared/* est résolu via le tsconfig du main process.
  tsconfig: 'electron/tsconfig.json',
  external: ['electron', 'better-sqlite3'],
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('[build-electron] mode watch actif — Ctrl+C pour quitter');
} else {
  await esbuild.build(options);
}
