import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { JoinPipe } from '../../core/pipes/join.pipe';
import { LibraryStore } from '../../core/library.store';
import { MinutesPipe } from '../../core/pipes/minutes.pipe';

/**
 * Liste des films affichables (mode classique) — version « brute » de la
 * phase 1 : cartes texte (titre, année, durée, genres). La vraie UI
 * Netflix (affiches, rangées, filtres) arrive en phase 3.
 */
@Component({
  selector: 'app-browse',
  imports: [TranslocoDirective, RouterLink, MinutesPipe, JoinPipe],
  templateUrl: './browse.html',
  // Relaye la chaîne flex du layout (voir admin-data.ts pour le pourquoi).
  host: { class: 'flex grow flex-col' },
})
export class Browse {
  protected readonly store = inject(LibraryStore);

  constructor() {
    void this.store.loadMovies();
  }
}
