import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatFormField, MatLabel, MatSuffix } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatOption, MatSelect } from '@angular/material/select';
import { TranslocoDirective } from '@jsverse/transloco';

import { BrowseStore, DurationBucket, SeenFilter, SortKey } from './browse.store';

/**
 * Barre de filtres et tris du browse (TODO 3.4) — champs Material
 * (charte : Material pour les formulaires), état porté par BrowseStore :
 * chaque widget lit son signal et l'écrit sur événement. Les critères
 * se COMBINENT (ET) ; « Réinitialiser » remet tout au défaut.
 */
@Component({
  selector: 'app-browse-filters',
  imports: [
    TranslocoDirective,
    MatFormField,
    MatLabel,
    MatSuffix,
    MatInput,
    MatSelect,
    MatOption,
    MatIcon,
    MatIconButton,
  ],
  templateUrl: './browse-filters.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrowseFilters {
  protected readonly browse = inject(BrowseStore);

  /** Tranches de durée proposées (l'ordre est celui de l'affichage). */
  protected readonly durationBuckets: readonly DurationBucket[] = [
    'all',
    'lt90',
    'b90to120',
    'b120to150',
    'gt150',
  ];

  /** États de visionnage proposés. */
  protected readonly seenFilters: readonly SeenFilter[] = ['all', 'seen', 'unseen'];

  /** Clés de tri proposées. */
  protected readonly sortKeys: readonly SortKey[] = ['title', 'year', 'added'];

  /** Relaye la saisie de recherche (événement input du champ texte). */
  protected onSearchInput(event: Event): void {
    this.browse.search.set((event.target as HTMLInputElement).value);
  }

  /** Inverse le sens du tri. */
  protected toggleSortDirection(): void {
    this.browse.sortDesc.set(!this.browse.sortDesc());
  }
}
