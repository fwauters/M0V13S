/**
 * CONTRAT IPC — source de vérité unique des échanges main <-> renderer.
 *
 * Règle d'or (CLAUDE.md) : toute nouvelle API IPC commence ICI.
 * 1. Déclarer le canal dans `IPC` et ses types de requête/réponse.
 * 2. Implémenter le handler côté main (electron/ipc/*.ipc.ts).
 * 3. Exposer la méthode côté preload (electron/preload.ts).
 * Le renderer ne voit que `window.api`, jamais ipcRenderer directement.
 */

/** Noms des canaux IPC, groupés par domaine. */
export const IPC = {
  system: {
    /** Ping de diagnostic : prouve la chaîne UI -> preload -> main -> DB. */
    ping: 'system:ping',
  },
  settings: {
    /** Lecture d'une préférence d'UI (clés autorisées : UiSettingKey). */
    get: 'settings:get',
    /** Écriture d'une préférence d'UI. */
    set: 'settings:set',
  },
} as const;

/**
 * Clés de réglage accessibles au RENDERER (préférences d'interface).
 * Les clés sensibles (clé TMDB, hash admin, racines) restent côté main
 * et ne transitent que par des canaux dédiés et contrôlés.
 */
export type UiSettingKey = 'ui.theme' | 'ui.lang';

/** Réponse du ping de diagnostic (étape 0.6). */
export interface SystemPingResult {
  /** Version de l'application (package.json). */
  appVersion: string;
  /** Version d'Electron embarquée. */
  electronVersion: string;
  /** Version de Node du main process. */
  nodeVersion: string;
  /** La base SQLite est ouverte, migrée, et une lecture/écriture a réussi. */
  dbOk: boolean;
  /** Dossier de données actif (diagnostic uniquement — jamais stocké). */
  dataDir: string;
}

/**
 * Forme de l'API exposée au renderer par le preload sous `window.api`.
 * Le renderer y accède via l'ApiService Angular (jamais en direct).
 */
export interface WindowApi {
  system: {
    ping(): Promise<SystemPingResult>;
  };
  settings: {
    /** Lit une préférence d'UI (null si jamais écrite ou DB indisponible). */
    get(key: UiSettingKey): Promise<string | null>;
    /** Persiste une préférence d'UI. */
    set(key: UiSettingKey, value: string): Promise<void>;
  };
}
