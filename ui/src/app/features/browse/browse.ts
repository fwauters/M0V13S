import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { JoinPipe } from '../../core/join.pipe';
import { LibraryStore } from '../../core/library.store';
import { MinutesPipe } from '../../core/minutes.pipe';

/**
 * Liste des films affichables (mode classique) — version « brute » de la
 * phase 1 : cartes texte (titre, année, durée, genres). La vraie UI
 * Netflix (affiches, rangées, filtres) arrive en phase 3.
 */
@Component({
  selector: 'app-browse',
  imports: [TranslocoDirective, RouterLink, MinutesPipe, JoinPipe],
  templateUrl: './browse.html',
})
export class Browse {
  protected readonly store = inject(LibraryStore);

  constructor() {
    void this.store.loadMovies();
  }
}
