import { Routes } from '@angular/router';

import { classicModeGuard } from './core/classic-mode.guard';

/**
 * Routes de l'application (composants chargés paresseusement).
 * Le mode classique (browse, fiche) est protégé par le guard de
 * conformité : si RIEN n'est reconnu, le mode Scanner est forcé.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then((m) => m.Home),
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
    loadComponent: () => import('./features/scan/scan').then((m) => m.Scan),
  },
  {
    path: 'admin/data',
    loadComponent: () =>
      import('./features/admin/admin-data').then((m) => m.AdminData),
  },
  { path: '**', redirectTo: '' },
];
