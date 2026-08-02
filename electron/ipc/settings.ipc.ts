/**
 * Handlers IPC du domaine « settings » (préférences d'UI).
 * Seules les clés de `UiSettingKey` sont acceptées : les réglages sensibles
 * (clé TMDB, hash admin, racines) ne passent JAMAIS par ces canaux.
 */
import { ipcMain } from 'electron';

import { IPC, UiSettingKey } from '@shared/ipc';
import type { SettingsService } from '../services/settings.service';

/** Liste blanche des clés exposées au renderer. */
const UI_KEYS: ReadonlySet<string> = new Set<UiSettingKey>(['ui.theme', 'ui.lang']);

/** Rejette toute clé hors liste blanche (bug d'appelant ou tentative louche). */
function assertUiKey(key: string): asserts key is UiSettingKey {
  if (!UI_KEYS.has(key)) {
    throw new Error(`Clé de réglage non autorisée côté renderer : ${key}`);
  }
}

/**
 * Enregistre les handlers « settings ».
 * @param service le service de réglages, ou null si la DB a échoué à
 *                s'ouvrir (lecture → null, écriture → silencieuse).
 */
export function registerSettingsIpc(service: SettingsService | null): void {
  ipcMain.handle(IPC.settings.get, (_event, key: string): string | null => {
    assertUiKey(key);
    return service?.get(key) ?? null;
  });

  ipcMain.handle(IPC.settings.set, (_event, key: string, value: string): void => {
    assertUiKey(key);
    service?.set(key, String(value));
  });
}
