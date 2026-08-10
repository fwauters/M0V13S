/**
 * e2e « smoke » sur le BUILD PACKAGÉ (TODO 5.7) — le test le plus proche
 * de la réalité : on lance l'EXE de release\win-unpacked (pas le dev
 * server) via le pilote Electron de Playwright et on vérifie le strict
 * vital : fenêtre créée, shell rendu (wordmark), premier lancement
 * proposé sur données fraîches, navigation de base.
 *
 * Prérequis : `pnpm package` (l'exe doit exister). Usage : `pnpm e2e`.
 * NB : le dossier data\ du build est SUPPRIMÉ pour un départ propre —
 * release\ est un artefact jetable, jamais la vraie bibliothèque.
 */
import fs from 'node:fs';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const APP_DIR = path.join(ROOT, 'release', 'win-unpacked');
const EXE = path.join(APP_DIR, 'M0V13S.exe');

/** Échec lisible + code de sortie non nul. */
function fail(message) {
  console.error(`[e2e] ÉCHEC : ${message}`);
  process.exit(1);
}

if (!fs.existsSync(EXE)) {
  fail(`exe introuvable (${EXE}) — lancer « pnpm package » d'abord.`);
}

// Données fraîches : l'app doit proposer l'écran de premier lancement.
fs.rmSync(path.join(APP_DIR, 'data'), { recursive: true, force: true });

// Piège documenté : ELECTRON_RUN_AS_NODE hérité des shells VS Code
// transformerait l'exe en Node pur (mort silencieuse immédiate).
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const app = await electron.launch({ executablePath: EXE, env });
try {
  const window = await app.firstWindow();

  // 1. Le shell est rendu : header avec le wordmark.
  await window.waitForSelector('app-root header', { timeout: 20_000 });
  const header = await window.textContent('app-root header');
  if (!header?.includes('M0V13S')) {
    fail('wordmark absent du header.');
  }

  // 2. Données fraîches → écran de premier lancement (guard /setup).
  await window.waitForSelector('app-setup', { timeout: 20_000 });

  // 3. Terminer l'assistant (aucun réglage) → retour à l'accueil, qui
  //    doit forcer le mode Scanner (bibliothèque vide = rien de reconnu).
  await window.click('app-setup button[matbutton="filled"]');
  await window.waitForSelector('app-home', { timeout: 20_000 });

  console.log('[e2e] OK : fenêtre, shell, premier lancement, accueil.');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  await app.close();
}
