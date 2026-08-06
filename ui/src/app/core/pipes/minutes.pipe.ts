import { Pipe, PipeTransform } from '@angular/core';

/**
 * Convertit des secondes en minutes entières (arrondi) pour l'affichage.
 * Pipe PUR : autorisé en template (règle CLAUDE.md — pas d'appel de
 * méthode direct dans les templates).
 */
@Pipe({ name: 'minutes' })
export class MinutesPipe implements PipeTransform {
  transform(durationSec: number | null | undefined): number | null {
    if (durationSec === null || durationSec === undefined) {
      return null;
    }
    return Math.round(durationSec / 60);
  }
}
