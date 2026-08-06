import {
  ApplicationConfig,
  isDevMode,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';

import { routes } from './app.routes';
import { TranslocoStaticLoader } from './core/i18n/transloco-static.loader';
import { APP_LANGS } from './core/services/language.service';

/**
 * Configuration racine de l'application (Angular zoneless).
 * - Router : les routes arrivent avec les features (phase 1+).
 * - Transloco : i18n à l'exécution, traductions bundlées (loader statique),
 *   changement de langue à chaud — voir LanguageService.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideTransloco({
      config: {
        availableLangs: [...APP_LANGS],
        // Langue par défaut avant que LanguageService applique son choix
        // (persistance + détection système) : anglais (PLAN § 6.6).
        defaultLang: 'en',
        fallbackLang: 'en',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoStaticLoader,
    }),
  ],
};
