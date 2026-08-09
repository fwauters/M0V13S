import { Injectable, signal } from '@angular/core';

/**
 * État de connectivité du renderer (signal `online`).
 *
 * Sert UNIQUEMENT aux fonctionnalités online-only assumées (le trailer
 * YouTube — CLAUDE.md) : le reste de l'app fonctionne hors ligne par
 * conception et ne doit jamais consulter ce service.
 *
 * `navigator.onLine` + événements `online`/`offline` suffisent ici : un
 * faux positif (réseau local sans internet) aboutit au même résultat
 * qu'une erreur de chargement YouTube — rien de bloquant.
 */
@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  private readonly _online = signal(navigator.onLine);
  /** Vrai si le système se croit connecté (réactif aux changements). */
  readonly online = this._online.asReadonly();

  constructor() {
    window.addEventListener('online', () => this._online.set(true));
    window.addEventListener('offline', () => this._online.set(false));
  }
}
