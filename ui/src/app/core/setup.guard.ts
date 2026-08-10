import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { ApiService } from './services/api.service';

/**
 * Guard de PREMIER LANCEMENT (phase 5) sur l'accueil : une app jamais
 * configurée (ni marquée « configurée », ni racines, ni mot de passe
 * admin) est redirigée vers l'assistant `/setup`.
 * Une installation déjà utilisée AVANT l'existence de l'assistant est
 * marquée configurée au passage — jamais de re-questionnement.
 */
export const setupGuard: CanActivateFn = async () => {
  const api = inject(ApiService);
  const router = inject(Router);

  if ((await api.getSetting('app.setupDone')) === '1') {
    return true;
  }
  const [roots, hasPassword] = await Promise.all([
    api.getLibraryRoots(),
    api.hasAdminPassword(),
  ]);
  if (roots.length > 0 || hasPassword) {
    // Installation antérieure à l'assistant : considérée configurée.
    await api.setSetting('app.setupDone', '1');
    return true;
  }
  return router.parseUrl('/setup');
};
