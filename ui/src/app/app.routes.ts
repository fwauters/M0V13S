import { Routes } from '@angular/router';

import { adminGuard } from './core/admin.guard';
import { classicModeGuard } from './core/classic-mode.guard';
import { setupGuard } from './core/setup.guard';

/**
 * Routes de l'application (composants chargés paresseusement).
 * Le mode classique (browse, fiche) est protégé par le guard de
 * conformité : si RIEN n'est reconnu, le mode Scanner est forcé.
 */
export const routes: Routes = [
  {
    path: '',
    // Premier lancement : redirige vers /setup tant que rien n'est configuré.
    canActivate: [setupGuard],
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
  },
  {
    path: 'setup',
    loadComponent: () => import('./features/setup/setup').then((m) => m.Setup),
  },
  {
    path: 'browse',
    canActivate: [classicModeGuard],
    loadComponent: () => import('./features/browse/browse').then((m) => m.Browse),
  },
  {
    path: 'movie/:id',
    canActivate: [classicModeGuard],
    loadComponent: () =>
      import('./features/detail/movie-detail').then((m) => m.MovieDetail),
  },
  {
    path: 'scan',
    // Mode admin (PLAN § 6.6) : le guard déverrouille (dialogue) au besoin.
    canActivate: [adminGuard],
    loadComponent: () => import('./features/scan/scan').then((m) => m.Scan),
  },
  {
    path: 'admin/data',
    canActivate: [adminGuard],
    loadComponent: () =>
      import('./features/admin/admin-data').then((m) => m.AdminData),
  },
  { path: '**', redirectTo: '' },
];
