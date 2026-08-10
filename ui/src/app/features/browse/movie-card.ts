import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import type { MovieListItem } from '@shared/dto';

import { MinutesPipe } from '../../core/pipes/minutes.pipe';
import { SidecarImgPipe } from '../../core/pipes/sidecar-img.pipe';
import { displayTitle } from './browse.store';

/**
 * Carte d'affiche du browse (rangées ET grille) : miniature en cache
 * (variante `thumb` du protocole images), survol charte « cinéma »
 * (zoom léger + anneau brand), lien vers la fiche détail.
 */
@Component({
  selector: 'app-movie-card',
  imports: [TranslocoDirective, RouterLink, MatIcon, MinutesPipe, SidecarImgPipe],
  templateUrl: './movie-card.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MovieCard {
  readonly movie = input.required<MovieListItem>();

  /** Titre d'affichage précalculé (règle : pas d'appel en template). */
  protected readonly title = computed(() => displayTitle(this.movie()));
}
