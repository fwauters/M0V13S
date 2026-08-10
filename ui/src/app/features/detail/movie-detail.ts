import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { TranslocoDirective } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import {
  tmdbLanguageLabel,
  type ManualEditInput,
  type MovieDetail as MovieDetailDto,
} from '@shared/dto';

import { ApiService } from '../../core/services/api.service';
import { ConnectivityService } from '../../core/services/connectivity.service';
import { JoinPipe } from '../../core/pipes/join.pipe';
import { LangNamesPipe } from '../../core/pipes/lang-names.pipe';
import { LanguageService } from '../../core/services/language.service';
import { MinutesPipe } from '../../core/pipes/minutes.pipe';
import { SidecarImgPipe } from '../../core/pipes/sidecar-img.pipe';
import { ChipsInput } from '../scan/chips-input';
import { TmdbEnrichDialog, TmdbEnrichDialogData } from './tmdb-enrich-dialog';
import { TrailerDialog, TrailerDialogData } from './trailer-dialog';
import { parseYoutubeKey } from '../../core/youtube';

/** Brouillon du formulaire d'édition manuelle (mêmes champs que l'assistant). */
interface EditDraft {
  titleVo: string;
  titleVf: string;
  year: number | null;
  overview: string;
  personalRating: number | null;
  personalNotes: string;
  tmdbRating: number | null;
  /** Saisie libre : URL YouTube ou clé brute (parsée à l'enregistrement). */
  trailer: string;
  /** Langues audio / sous-titres (codes : fr, en, jpn…) du fichier —
   *  éditables quand les pistes ne sont pas taguées. */
  audioLangs: string[];
  subtitleLangs: string[];
  directors: string[];
  writers: string[];
  actors: string[];
  genres: string[];
  tags: string[];
}

/** Carte d'acteur du casting (initiales précalculées — rien en template). */
interface ActorCard {
  name: string;
  character: string | null;
  initials: string;
}

/** Initiales d'un nom (deux premiers mots), sûres en Unicode. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 2)
    .map((word) => [...word][0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Fiche « cinéma » d'un film (phase 3) : hero backdrop + affiche, méta,
 * trailer YouTube (online-only), casting avec personnages, genres/tags en
 * chips, fichiers. Porte aussi l'enrichissement TMDB et l'édition
 * manuelle (décisions phase 2).
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
    MatHint,
    MatLabel,
    MatInput,
    MinutesPipe,
    JoinPipe,
    LangNamesPipe,
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

  /** Connectivité (signal) : pilote le bouton trailer (online-only). */
  protected readonly connectivity = inject(ConnectivityService);

  /** Langue de l'UI (signal) — paramètre du pipe langNames. */
  protected readonly uiLang = inject(LanguageService).lang;

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

  /** Casting du hero : nom + personnage + initiales pour l'avatar. */
  protected readonly actorCards = computed<ActorCard[]>(() =>
    (this.movie()?.people ?? [])
      .filter((p) => p.role === 'actor')
      .map((p) => ({ name: p.name, character: p.character, initials: initialsOf(p.name) })),
  );

  /** Durée affichée dans le hero : premier fichier qui la connaît. */
  protected readonly durationSec = computed(
    () =>
      (this.movie()?.files ?? []).find((f) => f.tech.durationSec !== null)?.tech.durationSec ??
      null,
  );

  /** Langues audio du hero : union dédupliquée sur tous les fichiers. */
  protected readonly audioLangs = computed(() => {
    const langs: string[] = [];
    for (const file of this.movie()?.files ?? []) {
      for (const lang of file.tech.audioLangs) {
        if (!langs.includes(lang)) {
          langs.push(lang);
        }
      }
    }
    return langs;
  });

  /** Langues de sous-titres du hero (même union). */
  protected readonly subtitleLangs = computed(() => {
    const langs: string[] = [];
    for (const file of this.movie()?.files ?? []) {
      for (const lang of file.tech.subtitleLangs) {
        if (!langs.includes(lang)) {
          langs.push(lang);
        }
      }
    }
    return langs;
  });

  /* ---------------- édition manuelle (décision phase 2) ------------- */

  /** Mode édition actif : la fiche devient un formulaire. */
  protected readonly editing = signal(false);
  /** Enregistrement de l'édition en cours (désactive les boutons). */
  protected readonly savingEdit = signal(false);
  /** Brouillon du formulaire (rempli à l'ouverture du mode édition). */
  protected editDraft: EditDraft = {
    titleVo: '', titleVf: '', year: null, overview: '', personalRating: null,
    personalNotes: '', tmdbRating: null, trailer: '',
    audioLangs: [], subtitleLangs: [],
    directors: [], writers: [], actors: [], genres: [], tags: [],
  };

  /** Libellé de la langue de fiches configurée (label du champ « Titre (…) »). */
  protected readonly metadataLangLabel = signal('');

  constructor() {
    void this.load();
    void this.api
      .getTmdbLanguageConfig()
      .then((config) => this.metadataLangLabel.set(tmdbLanguageLabel(config.metadataLanguage)));
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
      // Clé actuelle telle quelle (une URL collée sera parsée à l'enregistrement).
      trailer: m.trailerYoutubeKey ?? '',
      // Langues du PREMIER fichier (celui que l'enregistrement met à
      // jour côté main) — préremplies avec la détection ffprobe.
      audioLangs: [...(m.files[0]?.tech.audioLangs ?? [])],
      subtitleLangs: [...(m.files[0]?.tech.subtitleLangs ?? [])],
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
        // URL ou clé brute → clé YouTube (null si vide/inexploitable).
        trailerYoutubeKey: parseYoutubeKey(this.editDraft.trailer),
        // Codes langue normalisés en minuscules (fr, en, jpn…).
        audioLangs: this.editDraft.audioLangs.map((l) => l.trim().toLowerCase()).filter(Boolean),
        subtitleLangs: this.editDraft.subtitleLangs
          .map((l) => l.trim().toLowerCase())
          .filter(Boolean),
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
   * Ouvre le trailer YouTube en dialogue embarqué (online-only assumé —
   * le bouton est désactivé hors ligne). La clé est validée par une regex
   * stricte avant de construire l'URL d'embed.
   */
  protected openTrailer(): void {
    const m = this.movie();
    const key = m?.trailerYoutubeKey ?? null;
    if (m === null || key === null || !/^[A-Za-z0-9_-]{6,}$/.test(key)) {
      return;
    }
    const data: TrailerDialogData = { youtubeKey: key, title: m.titleVf ?? m.titleVo };
    this.dialog.open(TrailerDialog, { data, width: 'min(92vw, 60rem)', maxWidth: '95vw' });
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
