import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';

import { BrowseFilters } from './browse-filters';
import { BrowseStore } from './browse.store';
import { LibraryStore } from '../../core/library.store';
import { MovieCard } from './movie-card';
import { PosterRow } from './poster-row';

/**
 * Browse « façon Netflix » (phase 3) : rangée « ajoutés récemment »,
 * rangées par genre, puis grille complète des affiches. Les données
 * viennent de LibraryStore (liste chargée une fois), les rangées sont
 * dérivées par BrowseStore (computed — voir browse.store.ts).
 */
@Component({
  selector: 'app-browse',
  imports: [TranslocoDirective, RouterLink, MatIcon, BrowseFilters, MovieCard, PosterRow],
  templateUrl: './browse.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Relaye la chaîne flex du layout (voir admin-data.ts pour le pourquoi).
  host: { class: 'flex grow flex-col' },
})
export class Browse {
  protected readonly store = inject(LibraryStore);
  protected readonly browse = inject(BrowseStore);

  constructor() {
    void this.store.loadMovies();
  }
}
