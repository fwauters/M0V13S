import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type { ManualEditInput, MovieDetail as MovieDetailDto } from '@shared/dto';

import { ApiService } from '../../core/services/api.service';
import { JoinPipe } from '../../core/pipes/join.pipe';
import { MinutesPipe } from '../../core/pipes/minutes.pipe';
import { SidecarImgPipe } from '../../core/pipes/sidecar-img.pipe';
import { ChipsInput } from '../scan/chips-input';
import { TmdbEnrichDialog, TmdbEnrichDialogData } from './tmdb-enrich-dialog';

/** Brouillon du formulaire d'édition manuelle (mêmes champs que l'assistant). */
interface EditDraft {
  titleVo: string;
  titleVf: string;
  year: number | null;
  overview: string;
  personalRating: number | null;
  personalNotes: string;
  tmdbRating: number | null;
  directors: string[];
  writers: string[];
  actors: string[];
  genres: string[];
  tags: string[];
}

/**
 * Fiche sommaire d'un film (phase 1) : tous les champs de la fiche, la
 * liste des fichiers et leur état. La fiche « cinéma » (backdrop, affiche,
 * trailer) arrive en phase 3, l'édition en phase 5.
 */
@Component({
  selector: 'app-movie-detail',
  imports: [
    TranslocoDirective,
    RouterLink,
    FormsModule,
    MatButton,
    MatIcon,
    MatFormField,
    MatLabel,
    MatInput,
    MinutesPipe,
    JoinPipe,
    SidecarImgPipe,
    ChipsInput,
  ],
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

  /* ---------------- édition manuelle (décision phase 2) ------------- */

  /** Mode édition actif : la fiche devient un formulaire. */
  protected readonly editing = signal(false);
  /** Enregistrement de l'édition en cours (désactive les boutons). */
  protected readonly savingEdit = signal(false);
  /** Brouillon du formulaire (rempli à l'ouverture du mode édition). */
  protected editDraft: EditDraft = {
    titleVo: '', titleVf: '', year: null, overview: '', personalRating: null,
    personalNotes: '', tmdbRating: null,
    directors: [], writers: [], actors: [], genres: [], tags: [],
  };

  constructor() {
    void this.load();
  }

  /** Ouvre le formulaire d'édition, prérempli avec la fiche courante. */
  protected startEdit(): void {
    const m = this.movie();
    if (m === null) {
      return;
    }
    this.editDraft = {
      titleVo: m.titleVo,
      titleVf: m.titleVf ?? '',
      year: m.year,
      overview: m.overview ?? '',
      personalRating: m.personalRating,
      personalNotes: m.personalNotes ?? '',
      tmdbRating: m.tmdbRating,
      // Copies : le brouillon est modifiable sans toucher aux computed.
      directors: [...this.directors()],
      writers: [...this.writers()],
      actors: [...this.actors()],
      genres: [...m.genres],
      tags: [...m.tags],
    };
    this.editing.set(true);
  }

  /** Abandonne l'édition sans enregistrer. */
  protected cancelEdit(): void {
    this.editing.set(false);
  }

  /** Enregistre l'édition : fiche + `.nfo` + regroupement côté main. */
  protected async saveEdit(): Promise<void> {
    const m = this.movie();
    if (m === null || this.editDraft.titleVo.trim() === '') {
      return;
    }
    this.savingEdit.set(true);
    try {
      const form: ManualEditInput = {
        titleVo: this.editDraft.titleVo.trim(),
        titleVf: this.editDraft.titleVf.trim() === '' ? null : this.editDraft.titleVf.trim(),
        year: this.editDraft.year,
        overview: this.editDraft.overview.trim() === '' ? null : this.editDraft.overview.trim(),
        personalRating: this.editDraft.personalRating,
        personalNotes:
          this.editDraft.personalNotes.trim() === '' ? null : this.editDraft.personalNotes.trim(),
        tmdbRating: this.editDraft.tmdbRating,
        directors: this.editDraft.directors,
        writers: this.editDraft.writers,
        actors: this.editDraft.actors,
        genres: this.editDraft.genres,
        tags: this.editDraft.tags,
      };
      const updated = await this.api.updateMovie(m.id, form);
      if (updated) {
        this.editing.set(false);
        await this.load();
      }
    } finally {
      this.savingEdit.set(false);
    }
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
