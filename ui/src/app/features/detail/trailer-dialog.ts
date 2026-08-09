import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslocoDirective } from '@jsverse/transloco';

/** Données d'ouverture du dialogue trailer. */
export interface TrailerDialogData {
  /** Clé YouTube (déjà validée par l'appelant : [A-Za-z0-9_-]). */
  youtubeKey: string;
  /** Titre affiché en tête du dialogue (titre du film). */
  title: string;
}

/**
 * Dialogue de lecture du trailer — la SEULE ressource en ligne de l'UI
 * (CLAUDE.md : tout le reste est bundlé). Lecteur YouTube embarqué via
 * le domaine « nocookie » ; hors ligne, le bouton d'ouverture est
 * désactivé en amont (movie-detail), jamais d'erreur bloquante ici.
 */
@Component({
  selector: 'app-trailer-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoDirective, MatIconButton, MatIcon],
  template: `
    <ng-container *transloco="let t">
      <!-- Cadre noir : ambiance salle de cinéma, identique dans les deux thèmes. -->
      <div class="flex flex-col gap-2 bg-black p-3">
        <div class="flex items-center gap-2 text-white">
          <h2 class="grow truncate text-lg font-medium">{{ data.title }}</h2>
          <button matIconButton (click)="close()" [attr.aria-label]="t('common.close')">
            <mat-icon>close</mat-icon>
          </button>
        </div>
        <iframe
          [src]="embedUrl"
          [title]="t('detail.trailerButton')"
          class="aspect-video w-full rounded"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
    </ng-container>
  `,
})
export class TrailerDialog {
  protected readonly data = inject<TrailerDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<TrailerDialog>>(MatDialogRef);

  /**
   * URL d'embed youtube-nocookie, marquée sûre pour l'iframe. La clé est
   * validée par l'appelant (regex stricte) — le bypass ne couvre donc
   * qu'une URL construite par nous.
   */
  protected readonly embedUrl: SafeResourceUrl = inject(DomSanitizer).bypassSecurityTrustResourceUrl(
    `https://www.youtube-nocookie.com/embed/${this.data.youtubeKey}?autoplay=1`,
  );

  protected close(): void {
    this.dialogRef.close();
  }
}
