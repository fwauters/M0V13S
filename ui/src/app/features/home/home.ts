import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import {
  TMDB_METADATA_LANGUAGES,
  TMDB_TRAILER_LANGUAGES,
  type TmdbKeyStatus,
  type TmdbKeyTestResult,
  type TmdbLanguageConfig,
} from '@shared/dto';

import type {
  VlcUpdateCheckOutcome,
  VlcUpdateDownloadStatus,
  VlcUpdaterState,
} from '@shared/dto';

import { AdminLockService } from '../../core/services/admin-lock.service';
import { ApiService } from '../../core/services/api.service';
import { LibraryStore } from '../../core/library.store';

/**
 * Écran d'accueil — les deux options de la spec (PLAN § A) :
 * « Lancer le programme » (mode classique) et « Scanner les fichiers ».
 * Affiche la notice de conformité (à qualifier / manquants) et applique
 * la règle du scan forcé : mode classique inaccessible si rien n'est
 * reconnu (le guard des routes le garantit aussi côté navigation).
 *
 * Porte aussi la carte de la CLÉ API TMDB (décision phase 2) : chaque
 * utilisateur saisit la sienne ici, avant le scan — statut masqué,
 * bouton « Tester » (valide / invalide / hors ligne).
 */
@Component({
  selector: 'app-home',
  imports: [
    TranslocoDirective,
    RouterLink,
    FormsModule,
    MatIcon,
    MatButton,
    MatFormField,
    MatLabel,
    MatInput,
    MatSelect,
    MatOption,
  ],
  templateUrl: './home.html',
  // Relaye la chaîne flex du layout (voir admin-data.ts pour le pourquoi).
  host: { class: 'flex grow flex-col' },
})
export class Home {
  protected readonly store = inject(LibraryStore);

  /** Verrou admin (signal) : la section réglages TMDB est admin. */
  protected readonly adminLock = inject(AdminLockService);
  private readonly api = inject(ApiService);

  /** Statut (masqué) de la clé TMDB — null tant que non chargé. */
  protected readonly tmdbStatus = signal<TmdbKeyStatus | null>(null);
  /** Champ de saisie de clé visible (ajout ou remplacement). */
  protected readonly editingKey = signal(false);
  /** Saisie en cours (jamais réaffichée après enregistrement). */
  protected keyDraft = '';
  /** Test de validité en cours (désactive le bouton). */
  protected readonly testing = signal(false);
  /** Résultat du dernier test (null tant qu'aucun). */
  protected readonly testResult = signal<TmdbKeyTestResult | null>(null);

  /** Listes des langues proposées (dropdowns). */
  protected readonly metadataLanguages = TMDB_METADATA_LANGUAGES;
  protected readonly trailerLanguages = TMDB_TRAILER_LANGUAGES;

  /** Préférences de langues courantes (null tant que non chargées). */
  protected readonly languageConfig = signal<TmdbLanguageConfig | null>(null);

  /* -------- MAJ de VLC (carte admin — PLAN § 6.7, TODO 5.3) -------- */

  /** État du lecteur embarqué (null tant que non chargé). */
  protected readonly vlcState = signal<VlcUpdaterState | null>(null);
  /** Résultat de la dernière vérification (null avant tout clic). */
  protected readonly vlcCheck = signal<VlcUpdateCheckOutcome | null>(null);
  /** Vérification ou téléchargement en cours. */
  protected readonly vlcBusy = signal(false);
  /** Résultat du dernier téléchargement (null avant tout). */
  protected readonly vlcDownload = signal<VlcUpdateDownloadStatus | null>(null);

  constructor() {
    void this.store.ensureConformity();
    void this.refreshTmdbStatus();
    void this.api.getTmdbLanguageConfig().then((config) => this.languageConfig.set(config));
    void this.api.getVlcUpdaterState().then((state) => this.vlcState.set(state));
  }

  /** Vérifie la dernière version VLC publiée (bouton admin). */
  protected async checkVlc(): Promise<void> {
    this.vlcBusy.set(true);
    this.vlcDownload.set(null);
    try {
      this.vlcCheck.set(await this.api.checkVlcUpdate());
    } finally {
      this.vlcBusy.set(false);
    }
  }

  /** Télécharge la MAJ en staging (bascule au prochain démarrage). */
  protected async downloadVlc(): Promise<void> {
    this.vlcBusy.set(true);
    try {
      this.vlcDownload.set(await this.api.downloadVlcUpdate());
      this.vlcState.set(await this.api.getVlcUpdaterState());
    } finally {
      this.vlcBusy.set(false);
    }
  }

  /** Change la langue des fiches (persistée immédiatement). */
  protected onMetadataLanguageChange(metadataLanguage: string): void {
    const config = { ...(this.languageConfig() ?? { trailerLanguage: 'original' }), metadataLanguage };
    this.languageConfig.set(config as TmdbLanguageConfig);
    void this.api.setTmdbLanguageConfig(config as TmdbLanguageConfig);
  }

  /** Change la langue préférée du trailer (persistée immédiatement). */
  protected onTrailerLanguageChange(trailerLanguage: string): void {
    const config = { ...(this.languageConfig() ?? { metadataLanguage: 'en-US' }), trailerLanguage };
    this.languageConfig.set(config as TmdbLanguageConfig);
    void this.api.setTmdbLanguageConfig(config as TmdbLanguageConfig);
  }

  /** Ouvre le champ de saisie (le brouillon repart toujours vide). */
  protected startEditKey(): void {
    this.keyDraft = '';
    this.testResult.set(null);
    this.editingKey.set(true);
  }

  /** Ferme le champ de saisie sans enregistrer. */
  protected cancelEditKey(): void {
    this.keyDraft = '';
    this.editingKey.set(false);
  }

  /** Enregistre la clé saisie puis lance un test informatif. */
  protected async saveKey(): Promise<void> {
    const key = this.keyDraft.trim();
    if (key === '') {
      return;
    }
    await this.api.setTmdbKey(key);
    this.keyDraft = '';
    this.editingKey.set(false);
    await this.refreshTmdbStatus();
    // Test automatique après enregistrement : informatif, non bloquant
    // (hors ligne, la clé reste enregistrée et testable plus tard).
    await this.testStoredKey();
  }

  /** Teste la clé STOCKÉE contre l'API TMDB (bouton « Tester »). */
  protected async testStoredKey(): Promise<void> {
    this.testing.set(true);
    try {
      this.testResult.set(await this.api.testTmdbKey());
    } finally {
      this.testing.set(false);
    }
  }

  /** Recharge le statut masqué de la clé. */
  private async refreshTmdbStatus(): Promise<void> {
    this.tmdbStatus.set(await this.api.getTmdbKeyStatus());
  }
}
