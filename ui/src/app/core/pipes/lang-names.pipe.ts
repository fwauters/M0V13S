import { Pipe, PipeTransform } from '@angular/core';

import { languageDisplayName } from '../i18n/language-name';

/**
 * Liste de codes de langues de pistes → noms lisibles joints par des
 * virgules, dans la langue de l'UI (ex. `['fre','eng']` avec l'UI en
 * français → « Français, Anglais »).
 * Pipe PUR : la langue d'affichage est un PARAMÈTRE (signal lu dans le
 * template) — le rendu suit donc le changement de langue à chaud.
 */
@Pipe({ name: 'langNames' })
export class LangNamesPipe implements PipeTransform {
  transform(codes: string[], locale: string): string {
    return codes.map((code) => languageDisplayName(code, locale)).join(', ');
  }
}
