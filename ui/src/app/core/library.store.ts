import { Injectable, computed, inject, signal } from '@angular/core';
import type { ConformitySummary, MovieListItem } from '@shared/dto';

import { ApiService } from './services/api.service';

/**
 * Store (signaux) de l'état de la bibliothèque côté UI.
 *
 * Porte le résultat du scan de conformité du lancement (règle « présent ET
 * reconnu », scan forcé) et la liste des films affichables. Les composants
 * lisent les signaux ; SEUL ce store parle à l'ApiService pour ce domaine.
 */
@Injectable({ providedIn: 'root' })
export class LibraryStore {
  private readonly api = inject(ApiService);

  /** Résultat du dernier contrôle de conformité (null tant que non exécuté). */
  private readonly _conformity = signal<ConformitySummary | null>(null);
  readonly conformity = this._conformity.asReadonly();

  /** Vrai si le mode classique est interdit (rien de reconnu — PLAN § 6.1.4). */
  readonly forcedScan = computed(() => this._conformity()?.forcedScan ?? true);

  /** Films affichables (mode classique). */
  private readonly _movies = signal<MovieListItem[]>([]);
  readonly movies = this._movies.asReadonly();

  /** Chargement en cours (liste des films). */
  private readonly _loading = signal(false);
  readonly loading = this._loading.asReadonly();

  /** Promesse mémoïsée du contrôle de conformité (une exécution par session). */
  private conformityRun: Promise<ConformitySummary> | null = null;

  /**
   * Garantit qu'un contrôle de conformité a été exécuté (au plus un par
   * lancement) et retourne son résultat — utilisé par le guard de routes
   * et l'écran d'accueil.
   */
  ensureConformity(): Promise<ConformitySummary> {
    this.conformityRun ??= this.api.checkConformity().then((summary) => {
      this._conformity.set(summary);
      return summary;
    });
    return this.conformityRun;
  }

  /** Force un nouveau contrôle (après un scan qui a modifié l'index). */
  async refreshConformity(): Promise<ConformitySummary> {
    this.conformityRun = null;
    return this.ensureConformity();
  }

  /** (Re)charge la liste des films affichables. */
  async loadMovies(): Promise<void> {
    this._loading.set(true);
    try {
      this._movies.set(await this.api.listMovies());
    } finally {
      this._loading.set(false);
    }
  }
}
