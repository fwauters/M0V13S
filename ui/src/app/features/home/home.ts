import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';

import { LibraryStore } from '../../core/library.store';

/**
 * Écran d'accueil — les deux options de la spec (PLAN § A) :
 * « Lancer le programme » (mode classique) et « Scanner les fichiers ».
 * Affiche la notice de conformité (à qualifier / manquants) et applique
 * la règle du scan forcé : mode classique inaccessible si rien n'est
 * reconnu (le guard des routes le garantit aussi côté navigation).
 */
@Component({
  selector: 'app-home',
  imports: [TranslocoDirective, RouterLink, MatIcon],
  templateUrl: './home.html',
})
export class Home {
  protected readonly store = inject(LibraryStore);

  constructor() {
    void this.store.ensureConformity();
  }
}
