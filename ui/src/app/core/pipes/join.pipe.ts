import { Pipe, PipeTransform } from '@angular/core';

/**
 * Joint une liste de chaînes pour l'affichage (« A, B, C »).
 * Pipe PUR : autorisé en template (règle CLAUDE.md — pas d'appel de
 * méthode direct dans les templates).
 */
@Pipe({ name: 'join' })
export class JoinPipe implements PipeTransform {
  transform(values: readonly string[] | null | undefined, separator = ', '): string {
    return values?.join(separator) ?? '';
  }
}
