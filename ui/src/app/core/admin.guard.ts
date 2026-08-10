import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';

import { AdminLockService } from './services/admin-lock.service';

/**
 * Guard des routes du MODE ADMIN (scan, vue données) : si le verrou est
 * posé, ouvre le dialogue de mot de passe et n'active la route qu'en
 * cas de succès (sinon on reste où on était — jamais d'erreur).
 */
export const adminGuard: CanActivateFn = () => {
  return inject(AdminLockService).requestUnlock();
};
