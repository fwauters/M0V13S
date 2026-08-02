import { Component, input, model } from '@angular/core';
import { COMMA, ENTER } from '@angular/cdk/keycodes';
import { MatChipGrid, MatChipInput, MatChipInputEvent, MatChipRemove, MatChipRow } from '@angular/material/chips';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';

/**
 * Champ « liste de valeurs » réutilisable (Material chips) : personnes,
 * genres, tags… Ajout par Entrée ou virgule, suppression par chip.
 * Deux-way binding via `model()` : [(values)]="draft.genres".
 */
@Component({
  selector: 'app-chips-input',
  imports: [MatFormField, MatLabel, MatChipGrid, MatChipRow, MatChipInput, MatChipRemove, MatIcon],
  templateUrl: './chips-input.html',
})
export class ChipsInput {
  /** Libellé du champ (déjà traduit par le parent). */
  readonly label = input.required<string>();

  /** Valeurs courantes (two-way binding). */
  readonly values = model<string[]>([]);

  /** Touches qui valident une saisie (Entrée, virgule). */
  protected readonly separatorKeys = [ENTER, COMMA] as const;

  /** Ajoute la valeur saisie (ignorée si vide ou doublon). */
  protected add(event: MatChipInputEvent): void {
    const value = event.value.trim();
    if (value !== '' && !this.values().includes(value)) {
      this.values.update((current) => [...current, value]);
    }
    event.chipInput.clear();
  }

  /** Retire une valeur de la liste. */
  protected remove(value: string): void {
    this.values.update((current) => current.filter((v) => v !== value));
  }
}
