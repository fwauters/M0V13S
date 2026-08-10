import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonToggle, MatButtonToggleGroup } from '@angular/material/button-toggle';
import { TranslocoDirective } from '@jsverse/transloco';
import { AgGridAngular } from 'ag-grid-angular';
import {
  AllCommunityModule,
  ColDef,
  ModuleRegistry,
  colorSchemeDark,
  themeQuartz,
} from 'ag-grid-community';
import type { AdminTableName } from '@shared/dto';

import { ApiService } from '../../core/services/api.service';
import { ThemeService } from '../../core/services/theme.service';

// Enregistrement unique des modules Community (tri, filtre, virtualisation).
ModuleRegistry.registerModules([AllCommunityModule]);

/** Tables proposées dans le sélecteur (aligné sur la liste blanche du main). */
const TABLES: readonly AdminTableName[] = [
  'settings',
  'media',
  'video_files',
  'people',
  'media_people',
  'genres',
  'media_genres',
  'tags',
  'media_tags',
  'watch_state',
  'seasons',
  'episodes',
];

/**
 * Vue admin des tables de la DB (ag-grid Community) — LECTURE SEULE en
 * phase 1 : outil de contrôle et de diagnostic (tri, filtre, recherche).
 * L'édition (phase 5) passera par les services métier, jamais par du SQL
 * direct (décision PLAN § 1).
 */
@Component({
  selector: 'app-admin-data',
  imports: [TranslocoDirective, MatButtonToggleGroup, MatButtonToggle, AgGridAngular],
  templateUrl: './admin-data.html',
  // L'élément hôte doit relayer la chaîne flex du layout (main -> feature),
  // sinon la hauteur ne se propage pas et ag-grid (100 % interne) s'affiche
  // VIDE — bug relevé en validation de phase 1.
  host: { class: 'flex grow flex-col' },
})
export class AdminData {
  private readonly api = inject(ApiService);
  private readonly themeService = inject(ThemeService);

  protected readonly tables = TABLES;

  /** Table sélectionnée. */
  protected readonly selected = signal<AdminTableName>('media');

  /** Données de la table courante. */
  protected readonly columns = signal<ColDef[]>([]);
  protected readonly rows = signal<Array<Record<string, unknown>>>([]);
  protected readonly totalCount = signal(0);

  /** Vrai si l'affichage est tronqué (plafond de lignes du backend). */
  protected readonly truncated = computed(() => this.rows().length < this.totalCount());

  /**
   * Thème ag-grid synchronisé sur le thème de l'app (un seul signal).
   * `accentColor` pilote survol de ligne, sélection, coches et onglets
   * de filtres : aligné sur la charte (sarcelle en clair, ambre en
   * sombre) — le bleu par défaut de quartz jurait avec l'identité
   * (retour utilisateur phase 3).
   */
  protected readonly gridTheme = computed(() =>
    this.themeService.theme() === 'dark'
      ? themeQuartz
          .withPart(colorSchemeDark)
          .withParams({ accentColor: 'oklch(0.78 0.14 80)' })
      : themeQuartz.withParams({ accentColor: 'oklch(0.5 0.1 200)' }),
  );

  /** Réglages de colonnes communs : tri + filtre + redimensionnement. */
  protected readonly defaultColDef: ColDef = {
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 90,
  };

  constructor() {
    void this.load('media');
  }

  /** Change de table et recharge la grille. */
  protected onTableChange(table: AdminTableName): void {
    this.selected.set(table);
    void this.load(table);
  }

  /** Charge le contenu d'une table (lecture seule). */
  private async load(table: AdminTableName): Promise<void> {
    const data = await this.api.readAdminTable(table);
    this.columns.set(data.columns.map((field): ColDef => ({ field })));
    this.rows.set(data.rows);
    this.totalCount.set(data.totalCount);
  }
}
