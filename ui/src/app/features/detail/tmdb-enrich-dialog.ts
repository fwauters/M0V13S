import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { TranslocoDirective } from '@jsverse/transloco';
import type { TmdbCallStatus, TmdbSearchResult } from '@shared/dto';

import { ApiService } from '../../core/services/api.service';

/** Données d'ouverture : la fiche à enrichir + la requête préremplie. */
export interface TmdbEnrichDialogData {
  mediaId: number;
  query: string;
  year: number | null;
}

/**
 * Dialogue « Compléter via TMDB » (page fiche — décision utilisateur 2.6) :
 * recherche TMDB, choix du bon film, enrichissement de la fiche (tags et
 * note perso conservés) + réécriture `.nfo` + images sidecar.
 * Se ferme avec `true` si la fiche a été enrichie (le parent recharge).
 * Réutilise les clés i18n `scan.tmdb.*` (mêmes états que l'assistant).
 */
@Component({
  selector: 'app-tmdb-enrich-dialog',
  imports: [
    TranslocoDirective,
    FormsModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButton,
    MatFormField,
    MatLabel,
    MatInput,
    MatIcon,
  ],
  template: `
    <ng-container *transloco="let t">
      <h2 mat-dialog-title>{{ t('detail.enrichTitle') }}</h2>

      <mat-dialog-content class="flex w-[36rem] max-w-full flex-col gap-2">
        <div class="flex items-end gap-2">
          <mat-form-field class="grow" subscriptSizing="dynamic">
            <mat-label>{{ t('scan.tmdb.searchLabel') }}</mat-label>
            <input matInput [(ngModel)]="query" (keydown.enter)="search()" />
          </mat-form-field>
          <button matButton [disabled]="searching()" (click)="search()">
            {{ t('scan.tmdb.searchButton') }}
          </button>
        </div>

        @if (searching()) {
          <p class="text-sm opacity-70">{{ t('scan.tmdb.searching') }}</p>
        } @else if (applying()) {
          <p class="text-sm opacity-70">{{ t('scan.tmdb.loadingDetails') }}</p>
        } @else {
          @switch (status()) {
            @case ('idle') {}
            @case ('noKey') {
              <p class="text-sm text-amber-600 dark:text-amber-400">{{ t('scan.tmdb.noKey') }}</p>
            }
            @case ('ok') {
              @if (results().length === 0) {
                <p class="text-sm opacity-70">{{ t('scan.tmdb.noResults') }}</p>
              } @else {
                <div class="flex max-h-96 flex-col gap-1 overflow-y-auto">
                  @for (result of results(); track result.tmdbId) {
                    <button
                      type="button"
                      class="flex items-center gap-3 rounded-lg border border-black/10 p-2 text-left transition hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
                      (click)="pick(result)"
                    >
                      @if (result.posterUrl !== null) {
                        <img [src]="result.posterUrl" alt="" class="h-16 w-11 shrink-0 rounded object-cover" />
                      } @else {
                        <div class="flex h-16 w-11 shrink-0 items-center justify-center rounded bg-black/10 dark:bg-white/10">
                          <mat-icon inline>movie</mat-icon>
                        </div>
                      }
                      <span class="flex flex-col">
                        <span class="font-medium">
                          {{ result.title }}
                          @if (result.year !== null) {
                            ({{ result.year }})
                          }
                        </span>
                        @if (result.originalTitle !== result.title) {
                          <span class="text-sm opacity-70">{{ result.originalTitle }}</span>
                        }
                      </span>
                    </button>
                  }
                </div>
              }
            }
            <!-- Toute erreur : message ROUGE avec code + explication —
                 jamais bloquant (mêmes clés i18n que l'assistant). -->
            @default {
              <p class="text-sm font-medium text-red-600 dark:text-red-400">
                {{ t('scan.tmdb.errors.' + status(), { code: httpStatus() }) }}
              </p>
            }
          }
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button matButton (click)="dialogRef.close(false)">{{ t('common.cancel') }}</button>
      </mat-dialog-actions>
    </ng-container>
  `,
})
export class TmdbEnrichDialog {
  protected readonly data = inject<TmdbEnrichDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef = inject(MatDialogRef<TmdbEnrichDialog, boolean>);
  private readonly api = inject(ApiService);

  /** Requête de recherche (préremplie avec le titre VO de la fiche). */
  protected query = this.data.query;
  protected readonly searching = signal(false);
  protected readonly status = signal<'idle' | TmdbCallStatus>('idle');
  /** Code HTTP de la dernière erreur (affiché dans le message). */
  protected readonly httpStatus = signal<number | null>(null);
  protected readonly results = signal<TmdbSearchResult[]>([]);
  /** Enrichissement du film choisi en cours. */
  protected readonly applying = signal(false);

  constructor() {
    // Recherche lancée d'office : l'utilisateur n'a plus qu'à choisir.
    void this.search();
  }

  /** Lance (ou relance) la recherche TMDB. */
  protected async search(): Promise<void> {
    const query = this.query.trim();
    if (query === '') {
      return;
    }
    this.searching.set(true);
    try {
      const outcome = await this.api.searchTmdb(query, this.data.year);
      this.status.set(outcome.status);
      this.httpStatus.set(outcome.httpStatus);
      this.results.set(outcome.results);
    } finally {
      this.searching.set(false);
    }
  }

  /** Enrichit la fiche avec le film choisi, puis ferme si réussi. */
  protected async pick(result: TmdbSearchResult): Promise<void> {
    this.applying.set(true);
    try {
      const { status, httpStatus } = await this.api.enrichFromTmdb(
        this.data.mediaId,
        result.tmdbId,
      );
      if (status === 'ok') {
        this.dialogRef.close(true);
        return;
      }
      this.status.set(status);
      this.httpStatus.set(httpStatus);
    } finally {
      this.applying.set(false);
    }
  }
}
