import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { LibraryStore } from './library.store';

/**
 * Guard du mode classique (browse, fiches) — PLAN § 6.1.4.
 * Attend le résultat du contrôle de conformité du lancement : si RIEN
 * n'est reconnu (premier lancement, contenu partagé, DB vide), l'accès
 * est refusé et l'utilisateur est envoyé vers le mode Scanner.
 */
export const classicModeGuard: CanActivateFn = async () => {
  const store = inject(LibraryStore);
  const router = inject(Router);

  const summary = await store.ensureConformity();
  return summary.forcedScan ? router.parseUrl('/scan') : true;
};
