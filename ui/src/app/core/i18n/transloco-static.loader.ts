import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';

// Traductions importées STATIQUEMENT : elles sont bundlées dans le JS de
// l'application au build. C'est un choix délibéré pour Electron : en prod
// l'UI est chargée en `file://`, où un chargement HTTP des JSON serait
// fragile. Bonus : aucune requête réseau, conforme à l'exigence hors-ligne.
import fr from '../../../assets/i18n/fr.json';
import en from '../../../assets/i18n/en.json';

/** Table des langues embarquées. Ajouter une langue = un import + une entrée. */
const TRANSLATIONS: Record<string, Translation> = { fr, en };

/**
 * Loader Transloco « statique » : sert les traductions depuis le bundle,
 * sans HTTP. Implémente l'interface TranslocoLoader attendue par
 * provideTransloco (voir app.config.ts).
 */
@Injectable({ providedIn: 'root' })
export class TranslocoStaticLoader implements TranslocoLoader {
  /** Retourne la table de traduction d'une langue (objet vide si inconnue). */
  getTranslation(lang: string): Observable<Translation> {
    return of(TRANSLATIONS[lang] ?? {});
  }
}
