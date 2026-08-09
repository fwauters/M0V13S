import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  viewChild,
} from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';
import type { MovieListItem } from '@shared/dto';

import { MovieCard } from './movie-card';

/**
 * Rangée horizontale d'affiches (browse « façon Netflix ») : défilement
 * natif à la molette/au tactile, chevrons de page au survol (desktop).
 * La barre de défilement est masquée par la charte (scrollbar-hidden).
 */
@Component({
  selector: 'app-poster-row',
  imports: [TranslocoDirective, MatIcon, MovieCard],
  templateUrl: './poster-row.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PosterRow {
  /** Titre de la rangée (déjà traduit ou donnée brute : nom de genre). */
  readonly title = input.required<string>();
  readonly movies = input.required<MovieListItem[]>();

  /** Bande défilante (référence template) — cible des chevrons. */
  private readonly strip = viewChild.required<ElementRef<HTMLElement>>('strip');

  /** Fait défiler d'environ une page (90 % de la largeur visible). */
  protected scrollByPage(direction: 1 | -1): void {
    const el = this.strip().nativeElement;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: 'smooth' });
  }
}
