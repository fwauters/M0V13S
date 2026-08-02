/**
 * Scan rapide de conformité — exécuté à CHAQUE lancement (PLAN § 6.1).
 *
 * Listing disque seul (walker), rapprochement avec l'index, mise à jour
 * des statuts (`ok` / `missing`). AUCUN import ici : l'écriture de
 * nouvelles fiches passe exclusivement par le mode Scanner.
 */
import { inArray } from 'drizzle-orm';

import type { ConformitySummary } from '@shared/dto';
import type { AppDatabase } from '../db/client';
import { videoFiles } from '../db/schema';
import { diffLibrary } from './conformity.logic';
import { getDriveRoot } from './paths.service';
import type { SettingsService } from './settings.service';
import { walkLibraryRoots } from './walker.service';

export class ConformityService {
  constructor(
    private readonly db: AppDatabase,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Exécute le contrôle : compare le disque à l'index, met à jour les
   * statuts et retourne le résumé pour l'UI (notice « à qualifier »,
   * scan forcé si rien n'est reconnu).
   */
  run(): ConformitySummary {
    const roots = this.settings.getLibraryRoots();
    const found = walkLibraryRoots(getDriveRoot(), roots);
    const known = this.db
      .select({ relPath: videoFiles.relPath })
      .from(videoFiles)
      .all();

    const diff = diffLibrary(
      known.map((k) => k.relPath),
      found.map((f) => f.relPath),
    );

    // Mise à jour des statuts par lots (updates atomiques).
    if (diff.missingKnown.length > 0) {
      this.db
        .update(videoFiles)
        .set({ status: 'missing' })
        .where(inArray(videoFiles.relPath, diff.missingKnown))
        .run();
    }
    if (diff.presentKnown.length > 0) {
      // Un fichier revenu (disque rebranché, dossier restauré) redevient ok.
      this.db
        .update(videoFiles)
        .set({ status: 'ok' })
        .where(inArray(videoFiles.relPath, diff.presentKnown))
        .run();
    }

    return {
      recognizedCount: diff.presentKnown.length,
      missingCount: diff.missingKnown.length,
      toQualifyCount: diff.unknownPresent.length,
      // Règle PLAN § 6.1.4 : rien de reconnu → mode Scanner forcé.
      forcedScan: diff.presentKnown.length === 0,
    };
  }
}
