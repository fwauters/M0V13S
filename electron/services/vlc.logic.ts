/**
 * Logique PURE de la lecture VLC — sans spawn ni réseau, testable
 * directement sous Vitest. Le service d'exécution (vlc.service.ts)
 * n'ajoute que le spawn du process et la boucle de polling HTTP.
 *
 * Principe (PLAN § 6.3) : VLC portable est lancé avec son interface HTTP
 * locale activée ; le main process interroge `/requests/status.json`
 * pour suivre la position et en déduire le watch_state (reprise, vu
 * automatique à > 90 % de la durée).
 */

/** Un film est « vu » quand la position dépasse cette part de la durée. */
export const COMPLETION_RATIO = 0.9;

/** En dessous de cette position (s), pas de reprise : on repartira du début. */
export const MIN_RESUME_SEC = 60;

/** État de lecture extrait de `/requests/status.json`. */
export interface VlcStatus {
  state: 'playing' | 'paused' | 'stopped';
  /** Position courante (s), null si absente de la réponse. */
  timeSec: number | null;
  /** Durée totale (s), null si inconnue (flux pas encore ouvert). */
  lengthSec: number | null;
}

/**
 * Parse la réponse JSON de l'interface HTTP de VLC.
 * Tolérant : champs manquants → null, JSON illisible ou état inconnu →
 * null global (l'appelant ignore ce tick de polling, jamais de plantage).
 */
export function parseVlcStatus(json: string): VlcStatus | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  const state = data['state'];
  if (state !== 'playing' && state !== 'paused' && state !== 'stopped') {
    return null;
  }
  const timeSec = typeof data['time'] === 'number' ? data['time'] : null;
  // VLC renvoie length = -1 ou 0 tant que la durée est inconnue.
  const rawLength = typeof data['length'] === 'number' ? data['length'] : null;
  return {
    state,
    timeSec,
    lengthSec: rawLength !== null && rawLength > 0 ? rawLength : null,
  };
}

/** Vrai si la position vaut « vu jusqu'au bout » (> 90 % de la durée). */
export function isCompleted(positionSec: number | null, durationSec: number | null): boolean {
  return (
    positionSec !== null &&
    durationSec !== null &&
    durationSec > 0 &&
    positionSec >= durationSec * COMPLETION_RATIO
  );
}

/**
 * Position de reprise à sauvegarder en fin de lecture.
 * @returns null si le film est terminé (> 90 %) ou à peine entamé
 *          (< 60 s — on repartira du début), sinon la position telle
 *          quelle.
 */
export function resumeToSave(
  positionSec: number | null,
  durationSec: number | null,
): number | null {
  if (positionSec === null || positionSec < MIN_RESUME_SEC) {
    return null;
  }
  return isCompleted(positionSec, durationSec) ? null : positionSec;
}

/** Paramètres de lancement de VLC. */
export interface VlcLaunchOptions {
  /** Port HTTP local (choisi dynamiquement — PLAN § 8). */
  port: number;
  /** Mot de passe de l'interface HTTP (obligatoire depuis VLC 2.1). */
  password: string;
  /** Position de départ en secondes (0 = début). */
  startTimeSec: number;
}

/**
 * Arguments de la ligne de commande VLC.
 * - plein écran + fermeture automatique en fin de lecture ;
 * - `--no-one-instance` : sans lui, un VLC déjà ouvert sur la machine
 *   récupérerait le fichier et notre process se terminerait aussitôt
 *   (le suivi de position serait perdu) ;
 * - interface HTTP LOCALE uniquement (127.0.0.1, IPv4 explicite —
 *   règle maison) protégée par mot de passe jetable.
 */
export function buildVlcArgs(filePath: string, options: VlcLaunchOptions): string[] {
  return [
    '--fullscreen',
    '--play-and-exit',
    '--no-video-title-show',
    '--no-one-instance',
    '--extraintf', 'http',
    '--http-host', '127.0.0.1',
    '--http-port', String(options.port),
    '--http-password', options.password,
    ...(options.startTimeSec > 0 ? ['--start-time', String(options.startTimeSec)] : []),
    '--',
    filePath,
  ];
}

/** URL du statut de l'interface HTTP locale de VLC. */
export function statusUrl(port: number): string {
  return `http://127.0.0.1:${port}/requests/status.json`;
}

/** En-tête Basic Auth de l'interface HTTP (utilisateur vide + mot de passe). */
export function authHeader(password: string): string {
  return `Basic ${Buffer.from(`:${password}`).toString('base64')}`;
}
