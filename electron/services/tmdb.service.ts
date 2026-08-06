/**
 * TMDB — enrichissement des fiches (PLAN § 6.2) et gestion de la clé API.
 *
 * La clé est PERSONNELLE à chaque utilisateur de l'app (open source) :
 * saisie dans l'app (écran d'accueil), stockée dans `settings`
 * (`tmdb.apiKey`, côté data\ — jamais commitée), jamais renvoyée en clair
 * au renderer (statut masqué uniquement).
 *
 * Cette étape (2.3a) couvre la clé + son test de validité ; la recherche
 * et le mapping des fiches arrivent en 2.3b.
 */
import type { TmdbKeyStatus, TmdbKeyTestResult } from '@shared/dto';
import type { SettingsService } from './settings.service';

/** Base de l'API v3 de TMDB (seul hôte réseau autorisé pour ce service). */
const TMDB_API_BASE = 'https://api.themoviedb.org/3';

/** Délai maximal d'un appel de test (l'app est offline-first : on tranche vite). */
const TEST_TIMEOUT_MS = 8_000;

/**
 * Masque une clé pour affichage : uniquement les 4 derniers caractères.
 * (Une clé trop courte pour être masquée utilement est entièrement voilée.)
 */
export function maskApiKey(key: string): string {
  if (key.length <= 4) {
    return '****';
  }
  return `****${key.slice(-4)}`;
}

export class TmdbService {
  constructor(
    private readonly settings: SettingsService,
    /** fetch injectable — les tests fournissent un double, jamais de réseau. */
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  /** Clé stockée, ou null si absente/vide. */
  private storedKey(): string | null {
    const key = this.settings.get('tmdb.apiKey')?.trim() ?? '';
    return key === '' ? null : key;
  }

  /** Statut exposé au renderer (jamais la clé en clair). */
  getKeyStatus(): TmdbKeyStatus {
    const key = this.storedKey();
    return {
      configured: key !== null,
      maskedKey: key === null ? null : maskApiKey(key),
    };
  }

  /** Enregistre (ou efface, si vide) la clé API. */
  setKey(key: string): void {
    this.settings.set('tmdb.apiKey', key.trim());
  }

  /**
   * Teste une clé contre l'API TMDB (endpoint /configuration, léger).
   * @param candidateKey clé à tester ; par défaut la clé stockée
   * @returns 'valid' | 'invalid' (clé absente ou refusée) | 'offline'
   *          (réseau indisponible : impossible de trancher — la clé
   *          saisie hors ligne sera testable plus tard)
   */
  async testKey(candidateKey?: string): Promise<TmdbKeyTestResult> {
    const key = candidateKey?.trim() !== '' && candidateKey !== undefined
      ? candidateKey.trim()
      : this.storedKey();
    if (key === null) {
      return 'invalid';
    }

    try {
      const response = await this.fetchFn(
        `${TMDB_API_BASE}/configuration?api_key=${encodeURIComponent(key)}`,
        { signal: AbortSignal.timeout(TEST_TIMEOUT_MS) },
      );
      return response.ok ? 'valid' : 'invalid';
    } catch {
      // Échec réseau (hors ligne, DNS, timeout) : on ne peut pas conclure.
      return 'offline';
    }
  }
}
