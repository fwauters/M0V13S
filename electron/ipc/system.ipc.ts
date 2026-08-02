/**
 * Handlers IPC du domaine « system » (diagnostic / cycle de vie).
 * Contrat : shared/ipc.ts — ne jamais inventer un canal ici sans l'y déclarer.
 */
import { app, ipcMain } from 'electron';
import { sql } from 'drizzle-orm';

import { IPC, SystemPingResult } from '@shared/ipc';
import type { AppDatabase } from '../db/client';
import { getDataDir } from '../services/paths.service';

/**
 * Enregistre les handlers « system ».
 * @param db la base ouverte, ou null si son initialisation a échoué
 *           (le ping le signale au lieu de faire planter l'app).
 */
export function registerSystemIpc(db: AppDatabase | null): void {
  ipcMain.handle(IPC.system.ping, (): SystemPingResult => {
    // Preuve de vie de la DB : une lecture triviale qui traverse
    // réellement le moteur SQLite.
    let dbOk = false;
    if (db) {
      try {
        db.run(sql`SELECT 1`);
        dbOk = true;
      } catch {
        dbOk = false;
      }
    }

    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron ?? 'inconnue',
      nodeVersion: process.versions.node,
      dbOk,
      dataDir: getDataDir(),
    };
  });
}
