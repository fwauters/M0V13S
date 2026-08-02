import { Injectable } from '@angular/core';
import type { SystemPingResult, UiSettingKey } from '@shared/ipc';

/**
 * Façade Angular unique vers l'API IPC exposée par le preload Electron
 * (`window.api`, contrat : shared/ipc.ts).
 *
 * Règle (CLAUDE.md) : les composants et stores n'accèdent JAMAIS à
 * `window.api` directement — toujours via ce service, qui gère aussi le cas
 * « hors Electron » (ng serve ouvert dans un simple navigateur).
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  /** Vrai quand l'app tourne dans Electron (preload présent). */
  readonly available: boolean = window.api !== undefined;

  /**
   * Ping de diagnostic : traverse preload -> main -> SQLite et revient.
   * @returns le résultat, ou null hors Electron.
   */
  async pingSystem(): Promise<SystemPingResult | null> {
    if (!window.api) {
      return null;
    }
    return window.api.system.ping();
  }

  /** Lit une préférence d'UI persistée (null hors Electron ou si absente). */
  async getSetting(key: UiSettingKey): Promise<string | null> {
    if (!window.api) {
      return null;
    }
    return window.api.settings.get(key);
  }

  /** Persiste une préférence d'UI (silencieux hors Electron). */
  async setSetting(key: UiSettingKey, value: string): Promise<void> {
    await window.api?.settings.set(key, value);
  }
}
