import { Injectable } from '@angular/core';
import type { SystemPingResult } from '@shared/ipc';

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
}
