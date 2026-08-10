/**
 * Mise à jour du VLC portable embarqué (PLAN § 6.7) — mode admin,
 * en ligne uniquement. Déroulé en TROIS temps, jamais pendant une
 * lecture :
 * 1. `check()`   : compare la version installée (marqueur `.version`
 *                  dans tools\vlc) à la dernière publiée sur videolan.org ;
 * 2. `download()`: télécharge + extrait la nouvelle version dans
 *                  `tools\vlc-next` (staging — l'actuelle continue de
 *                  fonctionner) ;
 * 3. `applyPendingUpdate()` (au DÉMARRAGE suivant, main.ts) : bascule
 *                  vlc → vlc-prev (secours conservé) puis vlc-next → vlc.
 *
 * Toutes les dépendances d'environnement (fetch, dossier tools, unzip)
 * sont injectables — les tests travaillent sur un dossier temporaire
 * avec un faux réseau.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type {
  VlcUpdateCheckOutcome,
  VlcUpdateDownloadStatus,
  VlcUpdaterState,
} from '@shared/dto';
import { getToolsDir } from './paths.service';
import { VLC_LIST_URL, isUpdateWorthwhile, parseVlcListing } from './vlc-updater.logic';

/** Marqueur de version déposé dans le dossier VLC (écrit à l'install). */
const VERSION_MARKER = '.version';

/** Décompresse un zip via PowerShell Expand-Archive (natif Windows —
 *  même mécanique que scripts/prepare-tools.mjs, zéro dépendance). */
function defaultUnzip(zipPath: string, destDir: string): void {
  execFileSync('powershell.exe', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${destDir}" -Force`,
  ]);
}

/** Dépendances injectables (tests). */
export interface VlcUpdaterDeps {
  fetchFn?: typeof fetch;
  toolsDir?: () => string;
  unzipFn?: (zipPath: string, destDir: string) => void;
}

export class VlcUpdaterService {
  private readonly fetchFn: typeof fetch;
  private readonly toolsDir: () => string;
  private readonly unzipFn: (zipPath: string, destDir: string) => void;

  constructor(deps: VlcUpdaterDeps = {}) {
    this.fetchFn = deps.fetchFn ?? fetch;
    this.toolsDir = deps.toolsDir ?? getToolsDir;
    this.unzipFn = deps.unzipFn ?? defaultUnzip;
  }

  /* ------------------------- chemins ------------------------- */

  private vlcDir(): string {
    return path.join(this.toolsDir(), 'vlc');
  }
  private nextDir(): string {
    return path.join(this.toolsDir(), 'vlc-next');
  }
  private prevDir(): string {
    return path.join(this.toolsDir(), 'vlc-prev');
  }

  /** Lit le marqueur de version d'un dossier VLC (null si absent). */
  private versionOf(dir: string): string | null {
    try {
      return fs.readFileSync(path.join(dir, VERSION_MARKER), 'utf8').trim() || null;
    } catch {
      return null;
    }
  }

  /* -------------------------- états -------------------------- */

  /** État courant pour l'UI admin. */
  getState(): VlcUpdaterState {
    return {
      vlcPresent: fs.existsSync(path.join(this.vlcDir(), 'vlc.exe')),
      installedVersion: this.versionOf(this.vlcDir()),
      pendingVersion: fs.existsSync(this.nextDir()) ? this.versionOf(this.nextDir()) : null,
    };
  }

  /** Interroge videolan.org et compare à la version installée. */
  async check(): Promise<VlcUpdateCheckOutcome> {
    try {
      const response = await this.fetchFn(VLC_LIST_URL);
      if (!response.ok) {
        return { status: 'error', latestVersion: null };
      }
      const release = parseVlcListing(await response.text());
      if (release === null) {
        return { status: 'error', latestVersion: null };
      }
      const installed = this.getState().installedVersion;
      return {
        status: isUpdateWorthwhile(installed, release.version) ? 'update' : 'upToDate',
        latestVersion: release.version,
      };
    } catch {
      return { status: 'offline', latestVersion: null };
    }
  }

  /**
   * Télécharge la dernière version dans `tools\vlc-next` (staging).
   * La bascule n'a lieu qu'au prochain démarrage — la version en place
   * reste utilisable pendant et après le téléchargement.
   */
  async download(): Promise<VlcUpdateDownloadStatus> {
    const tmpDir = path.join(this.toolsDir(), '.update-tmp');
    try {
      const response = await this.fetchFn(VLC_LIST_URL);
      if (!response.ok) {
        return 'error';
      }
      const release = parseVlcListing(await response.text());
      if (release === null) {
        return 'error';
      }

      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.mkdirSync(tmpDir, { recursive: true });
      const zipPath = path.join(tmpDir, release.zipName);
      const zipResponse = await this.fetchFn(new URL(release.zipName, VLC_LIST_URL).href);
      if (!zipResponse.ok || zipResponse.body === null) {
        return 'error';
      }
      await pipeline(
        Readable.fromWeb(zipResponse.body as never),
        fs.createWriteStream(zipPath),
      );

      // Extraction puis dépôt ATOMIQUE (rename) en vlc-next.
      const extractDir = path.join(tmpDir, 'extract');
      this.unzipFn(zipPath, extractDir);
      const entries = fs
        .readdirSync(extractDir, { withFileTypes: true })
        .filter((e) => e.isDirectory());
      const inner = entries[0];
      if (entries.length !== 1 || inner === undefined) {
        return 'error'; // layout de zip inattendu : on ne touche à rien
      }
      // Intégrité minimale : le zip doit contenir vlc.exe.
      const extracted = path.join(extractDir, inner.name);
      if (!fs.existsSync(path.join(extracted, 'vlc.exe'))) {
        return 'error';
      }
      fs.writeFileSync(path.join(extracted, VERSION_MARKER), release.version, 'utf8');
      fs.rmSync(this.nextDir(), { recursive: true, force: true });
      fs.renameSync(extracted, this.nextDir());
      return 'ok';
    } catch {
      return 'offline';
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * Bascule au DÉMARRAGE (main.ts, avant toute lecture) : si une version
   * est en staging, l'actuelle devient `vlc-prev` (secours conservé
   * jusqu'à la mise à jour suivante) et la nouvelle prend sa place.
   * Échec → tentative de retour arrière, jamais d'app sans lecteur.
   */
  applyPendingUpdate(): void {
    const next = this.nextDir();
    const current = this.vlcDir();
    const prev = this.prevDir();
    if (!fs.existsSync(next)) {
      return;
    }
    try {
      fs.rmSync(prev, { recursive: true, force: true });
      if (fs.existsSync(current)) {
        fs.renameSync(current, prev);
      }
      fs.renameSync(next, current);
    } catch {
      // Retour arrière : remettre l'ancienne version si la bascule a
      // échoué à mi-chemin (la MAJ sera retentée/retéléchargée).
      if (!fs.existsSync(current) && fs.existsSync(prev)) {
        try {
          fs.renameSync(prev, current);
        } catch {
          // Disque en très mauvais état : l'UI signalera vlcMissing.
        }
      }
    }
  }
}
