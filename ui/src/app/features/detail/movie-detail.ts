import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatIcon } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';
import type { MovieDetail as MovieDetailDto } from '@shared/dto';

import { ApiService } from '../../core/services/api.service';
import { JoinPipe } from '../../core/pipes/join.pipe';
import { MinutesPipe } from '../../core/pipes/minutes.pipe';

/**
 * Fiche sommaire d'un film (phase 1) : tous les champs de la fiche, la
 * liste des fichiers et leur état. La fiche « cinéma » (backdrop, affiche,
 * trailer) arrive en phase 3, l'édition en phase 5.
 */
@Component({
  selector: 'app-movie-detail',
  imports: [TranslocoDirective, RouterLink, MatIcon, MinutesPipe, JoinPipe],
  templateUrl: './movie-detail.html',
  // Relaye la chaîne flex du layout (voir admin-data.ts pour le pourquoi).
  host: { class: 'flex grow flex-col' },
})
export class MovieDetail {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);

  /** Fiche chargée (null = introuvable une fois `loaded` vrai). */
  protected readonly movie = signal<MovieDetailDto | null>(null);
  protected readonly loaded = signal(false);

  /** Personnes regroupées par rôle (précalculées — rien en template). */
  protected readonly directors = computed(() =>
    (this.movie()?.people ?? []).filter((p) => p.role === 'director').map((p) => p.name),
  );
  protected readonly writers = computed(() =>
    (this.movie()?.people ?? []).filter((p) => p.role === 'writer').map((p) => p.name),
  );
  protected readonly actors = computed(() =>
    (this.movie()?.people ?? []).filter((p) => p.role === 'actor').map((p) => p.name),
  );

  constructor() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    void this.api.getMovie(id).then((movie) => {
      this.movie.set(movie);
      this.loaded.set(true);
    });
  }
}
