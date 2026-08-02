/**
 * prepare-tools — télécharge les binaires tiers embarqués dans tools\.
 *
 * Ces binaires ne sont JAMAIS commités (voir .gitignore et la décision
 * open source du PLAN § 1) : ce script les récupère au moment du packaging.
 * - ffprobe (FFmpeg, build « essentials » de gyan.dev) → tools\ffprobe.exe
 *   (utilisé dès la phase 1 pour extraire durée/codecs/résolution) ;
 * - VLC portable (dernière version win64 de get.videolan.org) → tools\vlc\
 *   (le lecteur de l'app, phase 4).
 *
 * Usage :
 *   pnpm prepare-tools                # tout (ffprobe + VLC)
 *   pnpm prepare-tools --only=ffprobe # un seul outil
 *   pnpm prepare-tools --only=vlc
 *
 * NB : script Windows-only (utilise Expand-Archive de PowerShell pour
 * décompresser sans dépendance npm) — cohérent avec la cible du projet.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

/** Racine du repo (ce script vit dans scripts\). */
const ROOT = path.resolve(import.meta.dirname, '..');
/** Dossier cible des binaires embarqués. */
const TOOLS_DIR = path.join(ROOT, 'tools');
/** Dossier de travail temporaire (téléchargements, extractions). */
const TMP_DIR = path.join(TOOLS_DIR, '.tmp');

/** Source ffprobe : build FFmpeg « essentials » maintenu par gyan.dev. */
const FFMPEG_URL = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
/** Répertoire officiel des builds VLC win64 (« last » = dernière stable). */
const VLC_LIST_URL = 'https://get.videolan.org/vlc/last/win64/';

/** Télécharge `url` vers `dest` (flux, pas de mise en mémoire complète). */
async function download(url, dest) {
  console.log(`[prepare-tools] téléchargement : ${url}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || response.body === null) {
    throw new Error(`Téléchargement échoué (${response.status}) : ${url}`);
  }
  await pipeline(response.body, fs.createWriteStream(dest));
}

/** Décompresse un zip via PowerShell Expand-Archive (natif Windows). */
function unzip(zipPath, destDir) {
  console.log(`[prepare-tools] extraction : ${path.basename(zipPath)}`);
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${destDir}" -Force`,
  ]);
}

/** Retourne l'unique sous-dossier de `dir` (layout classique des zips). */
function onlySubdir(dir) {
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory());
  if (entries.length !== 1 || entries[0] === undefined) {
    throw new Error(`Layout inattendu dans ${dir} (1 dossier attendu)`);
  }
  return path.join(dir, entries[0].name);
}

/** Installe ffprobe.exe dans tools\. */
async function prepareFfprobe() {
  const zipPath = path.join(TMP_DIR, 'ffmpeg.zip');
  const extractDir = path.join(TMP_DIR, 'ffmpeg');
  await download(FFMPEG_URL, zipPath);
  unzip(zipPath, extractDir);
  // Le zip contient un dossier ffmpeg-<version>-essentials_build\bin\ffprobe.exe.
  const ffprobe = path.join(onlySubdir(extractDir), 'bin', 'ffprobe.exe');
  fs.copyFileSync(ffprobe, path.join(TOOLS_DIR, 'ffprobe.exe'));
  console.log('[prepare-tools] OK : tools\\ffprobe.exe');
}

/** Installe VLC portable dans tools\vlc\. */
async function prepareVlc() {
  // 1. Trouver le nom du zip de la dernière version dans l'index HTML.
  const listing = await (await fetch(VLC_LIST_URL)).text();
  const match = listing.match(/href="(vlc-[\d.]+-win64\.zip)"/);
  if (!match || match[1] === undefined) {
    throw new Error(`Zip VLC introuvable dans l'index ${VLC_LIST_URL}`);
  }
  const zipName = match[1];

  // 2. Télécharger et extraire.
  const zipPath = path.join(TMP_DIR, zipName);
  const extractDir = path.join(TMP_DIR, 'vlc');
  await download(new URL(zipName, VLC_LIST_URL).href, zipPath);
  unzip(zipPath, extractDir);

  // 3. Déposer le contenu (dossier vlc-<version>) dans tools\vlc.
  const target = path.join(TOOLS_DIR, 'vlc');
  fs.rmSync(target, { recursive: true, force: true });
  fs.renameSync(onlySubdir(extractDir), target);
  console.log(`[prepare-tools] OK : tools\\vlc\\ (${zipName})`);
}

// --- Point d'entrée -------------------------------------------------------
const only = process.argv
  .find((a) => a.startsWith('--only='))
  ?.slice('--only='.length);

fs.mkdirSync(TMP_DIR, { recursive: true });
try {
  if (only === undefined || only === 'ffprobe') {
    await prepareFfprobe();
  }
  if (only === undefined || only === 'vlc') {
    await prepareVlc();
  }
} finally {
  // Nettoyage du dossier temporaire quoi qu'il arrive.
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}
console.log('[prepare-tools] terminé.');
