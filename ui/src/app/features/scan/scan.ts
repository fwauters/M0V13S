import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatProgressBar } from '@angular/material/progress-bar';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import type {
  QualifyMovieInput,
  ScanMissingFile,
  ScanNewFile,
  ScanProgress,
  ScanRelinkCandidate,
  ScanResult,
} from '@shared/dto';

import { ApiService } from '../../core/services/api.service';
import { LibraryStore } from '../../core/library.store';
import { MinutesPipe } from '../../core/pipes/minutes.pipe';
import { ChipsInput } from './chips-input';
import { ConfirmDialog, ConfirmDialogData } from './confirm-dialog';

/** Brouillon de fiche de l'assistant (modifiable champ par champ). */
interface QualifyDraft {
  titleVo: string;
  titleVf: string;
  year: number | null;
  overview: string;
  personalRating: number | null;
  directors: string[];
  writers: string[];
  actors: string[];
  genres: string[];
  tags: string[];
}

/**
 * Mode Scanner (PLAN § 6.2) — seul point d'entrée des écritures d'index :
 * 1. configuration des racines de bibliothèque (relatives au lecteur) ;
 * 2. scan (progression + annulation) ;
 * 3. re-liens proposés, fiches manquantes (suppression sur confirmation) ;
 * 4. assistant de qualification MANUELLE des nouveaux fichiers
 *    (préremplissage TMDB en phase 2).
 */
@Component({
  selector: 'app-scan',
  imports: [
    TranslocoDirective,
    FormsModule,
    MatButton,
    MatIconButton,
    MatIcon,
    MatFormField,
    MatLabel,
    MatInput,
    MatProgressBar,
    MinutesPipe,
    ChipsInput,
  ],
  templateUrl: './scan.html',
  // Relaye la chaîne flex du layout (voir admin-data.ts pour le pourquoi).
  host: { class: 'flex grow flex-col' },
})
export class Scan implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly store = inject(LibraryStore);
  private readonly dialog = inject(MatDialog);
  private readonly transloco = inject(TranslocoService);

  /* ------------------- racines de bibliothèque ------------------- */

  /** Racines configurées (chemins relatifs au lecteur). */
  protected readonly roots = signal<string[]>([]);
  /** Saisie en cours d'ajout de racine. */
  protected rootDraft = '';

  /* --------------------------- scan ------------------------------ */

  protected readonly scanning = signal(false);
  protected readonly progress = signal<ScanProgress | null>(null);
  protected readonly result = signal<ScanResult | null>(null);
  /** Valeur 0-100 pour la barre de progression Material. */
  protected readonly progressPercent = computed(() => {
    const p = this.progress();
    return p === null || p.total === 0 ? 0 : Math.round((p.done / p.total) * 100);
  });

  /* ------------------ assistant de qualification ----------------- */

  /** Index du fichier en cours dans result().newFiles. */
  protected readonly currentIndex = signal(0);
  /** Fichier en cours de qualification (null quand tout est traité). */
  protected readonly currentFile = computed<ScanNewFile | null>(() => {
    const files = this.filmFiles();
    return files[this.currentIndex()] ?? null;
  });
  /**
   * Fichier courant sous forme de liste 0-ou-1 élément : le template
   * l'itère avec `track file.relPath` pour que le sous-arbre du formulaire
   * soit DÉTRUIT ET RECRÉÉ à chaque changement de fichier. Sans cela, les
   * widgets (inputs ngModel, chips) sont réutilisés et peuvent conserver
   * les saisies du film précédent (bug relevé en validation de phase 1).
   */
  protected readonly currentFileList = computed<ScanNewFile[]>(() => {
    const file = this.currentFile();
    return file === null ? [] : [file];
  });
  /** Nouveaux fichiers « film » (les épisodes détectés sont écartés en v1). */
  protected readonly filmFiles = computed(() =>
    (this.result()?.newFiles ?? []).filter((f) => !f.guess.looksLikeEpisode),
  );
  /** Fichiers détectés comme épisodes de série (non gérés en v1). */
  protected readonly episodeFiles = computed(() =>
    (this.result()?.newFiles ?? []).filter((f) => f.guess.looksLikeEpisode),
  );
  /** Brouillon de la fiche en cours. */
  protected draft: QualifyDraft = this.emptyDraft();
  /** Sauvegarde en cours (désactive le bouton). */
  protected readonly saving = signal(false);

  /** Désinscription de l'événement de progression (fuite sinon). */
  private readonly unsubscribeProgress: () => void;

  constructor() {
    void this.api.getLibraryRoots().then((roots) => this.roots.set(roots));
    this.unsubscribeProgress = this.api.onScanProgress((p) => this.progress.set(p));
  }

  ngOnDestroy(): void {
    this.unsubscribeProgress();
  }

  /* ------------------- racines : ajout/retrait ------------------- */

  protected addRoot(): void {
    const value = this.rootDraft.trim().replace(/\\/g, '/');
    if (value !== '' && !this.roots().includes(value)) {
      this.roots.update((r) => [...r, value]);
      void this.api.setLibraryRoots(this.roots());
    }
    this.rootDraft = '';
  }

  protected removeRoot(root: string): void {
    this.roots.update((r) => r.filter((x) => x !== root));
    void this.api.setLibraryRoots(this.roots());
  }

  /* --------------------------- scan ------------------------------ */

  protected async startScan(): Promise<void> {
    this.scanning.set(true);
    this.progress.set(null);
    this.result.set(null);
    this.currentIndex.set(0);
    try {
      const result = await this.api.scan();
      this.result.set(result);
      this.prepareDraft();
    } finally {
      this.scanning.set(false);
    }
  }

  protected cancelScan(): void {
    void this.api.cancelScan();
  }

  /* ---------------- re-liens et fiches manquantes ---------------- */

  protected async acceptRelink(candidate: ScanRelinkCandidate): Promise<void> {
    await this.api.relink(candidate);
    this.result.update((r) =>
      r === null
        ? null
        : { ...r, relinkCandidates: r.relinkCandidates.filter((c) => c !== candidate) },
    );
    await this.store.refreshConformity();
  }

  protected async confirmDelete(missing: ScanMissingFile): Promise<void> {
    // Textes traduits ICI (le dialogue est agnostique de l'i18n).
    const data: ConfirmDialogData = {
      title: this.transloco.translate('scan.confirmDeleteTitle'),
      message: this.transloco.translate('scan.confirmDeleteMessage', {
        title: missing.mediaTitle,
      }),
      confirmLabel: this.transloco.translate('scan.deleteAction'),
      cancelLabel: this.transloco.translate('common.cancel'),
    };
    const confirmed = await firstValueFrom(
      this.dialog.open(ConfirmDialog, { data }).afterClosed(),
    );
    if (confirmed === true) {
      await this.api.deleteMedia(missing.mediaId);
      this.result.update((r) =>
        r === null
          ? null
          : { ...r, missingFiles: r.missingFiles.filter((m) => m.mediaId !== missing.mediaId) },
      );
      await this.store.refreshConformity();
    }
  }

  /* ------------------ assistant de qualification ----------------- */

  /** Enregistre la fiche du fichier courant puis passe au suivant. */
  protected async saveCurrent(): Promise<void> {
    const file = this.currentFile();
    if (file === null || this.draft.titleVo.trim() === '') {
      return;
    }
    this.saving.set(true);
    try {
      const input: QualifyMovieInput = {
        relPath: file.relPath,
        sizeBytes: file.sizeBytes,
        mtimeMs: file.mtimeMs,
        tech: file.tech,
        partNumber: file.guess.partNumber,
        titleVo: this.draft.titleVo.trim(),
        titleVf: this.draft.titleVf.trim() === '' ? null : this.draft.titleVf.trim(),
        year: this.draft.year,
        overview: this.draft.overview.trim() === '' ? null : this.draft.overview.trim(),
        personalRating: this.draft.personalRating,
        directors: this.draft.directors,
        writers: this.draft.writers,
        actors: this.draft.actors,
        genres: this.draft.genres,
        tags: this.draft.tags,
      };
      await this.api.qualify(input);
      this.advance();
      await this.store.refreshConformity();
    } finally {
      this.saving.set(false);
    }
  }

  /** Ignore le fichier courant (requalifiable au prochain scan). */
  protected skipCurrent(): void {
    this.advance();
  }

  /** Passe au fichier suivant et prépare son brouillon. */
  private advance(): void {
    this.currentIndex.update((i) => i + 1);
    this.prepareDraft();
  }

  /** Préremplit le brouillon depuis le parsing du nom de fichier. */
  private prepareDraft(): void {
    const file = this.currentFile();
    this.draft = this.emptyDraft();
    if (file !== null) {
      this.draft.titleVo = file.guess.title;
      this.draft.year = file.guess.year;
    }
  }

  private emptyDraft(): QualifyDraft {
    return {
      titleVo: '',
      titleVf: '',
      year: null,
      overview: '',
      personalRating: null,
      directors: [],
      writers: [],
      actors: [],
      genres: [],
      tags: [],
    };
  }
}
