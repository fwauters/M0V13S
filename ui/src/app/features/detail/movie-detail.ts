import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { MovieDetail as MovieDetailDto } from '@shared/dto';

import { ApiService } from '../../core/services/api.service';
import { JoinPipe } from '../../core/pipes/join.pipe';
import { MinutesPipe } from '../../core/pipes/minutes.pipe';
import { TmdbEnrichDialog, TmdbEnrichDialogData } from './tmdb-enrich-dialog';

/**
 * Fiche sommaire d'un film (phase 1) : tous les champs de la fiche, la
 * liste des fichiers et leur état. La fiche « cinéma » (backdrop, affiche,
 * trailer) arrive en phase 3, l'édition en phase 5.
 */
@Component({
  selector: 'app-movie-detail',
  imports: [TranslocoDirective, RouterLink, MatButton, MatIcon, MinutesPipe, JoinPipe],
  templateUrl: './movie-detail.html',
  // Relaye la chaîne flex du layout (voir admin-data.ts pour le pourquoi).
  host: { class: 'flex grow flex-col' },
})
export class MovieDetail {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);

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
    void this.load();
  }

  /** (Re)charge la fiche depuis la route courante. */
  private async load(): Promise<void> {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.movie.set(await this.api.getMovie(id));
    this.loaded.set(true);
  }

  /**
   * Ouvre le dialogue « Compléter via TMDB » (décision utilisateur 2.6) :
   * si la fiche a été enrichie, elle est rechargée pour refléter la mise
   * à jour (fiche + `.nfo` + images réécrits côté main).
   */
  protected async openEnrichDialog(): Promise<void> {
    const m = this.movie();
    if (m === null) {
      return;
    }
    const data: TmdbEnrichDialogData = { mediaId: m.id, query: m.titleVo, year: m.year };
    const enriched = await firstValueFrom(
      this.dialog.open(TmdbEnrichDialog, { data }).afterClosed(),
    );
    if (enriched === true) {
      await this.load();
    }
  }
}
