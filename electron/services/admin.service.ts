/**
 * Verrou du mode admin (PLAN § 6.6) — mot de passe hashé en scrypt
 * (module `crypto` de Node, aucune dépendance) stocké dans `settings`
 * (clé `admin.passwordHash`, JAMAIS exposée au renderer : seuls les
 * canaux dédiés vérifient/écrivent).
 *
 * Obfuscation ASSUMÉE (usage privé) : le verrou décourage la curiosité
 * (mode admin = scan, réglages, édition, vue données), il ne prétend pas
 * résister à qui a accès au disque.
 */
import crypto from 'node:crypto';

import type { SettingsService } from './settings.service';

/** Clé de réglage du hash (main uniquement — hors UiSettingKey). */
const PASSWORD_HASH_KEY = 'admin.passwordHash';

/** Longueur de clé dérivée scrypt (octets). */
const SCRYPT_KEYLEN = 64;

/** Hash `sel:clé` d'un mot de passe (sel aléatoire par mot de passe). */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

/** Vérifie un mot de passe contre un hash stocké (comparaison à temps
 *  constant ; hash illisible → refus, jamais d'exception). */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (salt === undefined || hash === undefined || salt === '' || hash === '') {
    return false;
  }
  try {
    const candidate = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export class AdminService {
  constructor(private readonly settings: SettingsService) {}

  /** Vrai si un mot de passe admin a été défini (premier lancement). */
  hasPassword(): boolean {
    return this.settings.get(PASSWORD_HASH_KEY) !== null;
  }

  /**
   * Vérifie le mot de passe saisi au déverrouillage.
   * Aucun mot de passe défini → toujours vrai (l'app n'est pas encore
   * configurée : le mode admin reste ouvert, l'écran de premier
   * lancement proposera d'en créer un).
   */
  verify(password: string): boolean {
    const stored = this.settings.get(PASSWORD_HASH_KEY);
    return stored === null ? true : verifyPassword(password, stored);
  }

  /**
   * Définit (ou remplace) le mot de passe admin.
   * @param currentPassword exigé et vérifié si un mot de passe existe
   *        déjà (null accepté seulement à la création).
   * @returns faux si le mot de passe actuel est incorrect ou si le
   *          nouveau est vide.
   */
  setPassword(newPassword: string, currentPassword: string | null): boolean {
    if (newPassword.trim() === '') {
      return false;
    }
    const stored = this.settings.get(PASSWORD_HASH_KEY);
    if (stored !== null && (currentPassword === null || !verifyPassword(currentPassword, stored))) {
      return false;
    }
    this.settings.set(PASSWORD_HASH_KEY, hashPassword(newPassword));
    return true;
  }
}
