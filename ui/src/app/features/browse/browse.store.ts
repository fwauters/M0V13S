import { Injectable, computed, inject } from '@angular/core';
import type { MovieListItem } from '@shared/dto';

import { LibraryStore } from '../../core/library.store';

/**
 * Store (signaux) du browse « façon Netflix » : dérive les rangées de la
 * liste des films portée par LibraryStore. Tout est calculé en mémoire
 * (computed) — la liste est chargée une fois, les rangées (et bientôt les
 * filtres, TODO 3.4) réagissent instantanément.
 */

/** Une rangée « genre » (titre affiché = nom du genre, pas de clé i18n). */
export interface GenreRow {
  genre: string;
  movies: MovieListItem[];
}

/** Nombre maximum de rangées de genres (les plus fournis d'abord). */
const MAX_GENRE_ROWS = 8;

/** Un genre n'a sa rangée qu'à partir de ce nombre de films (sous ce
 *  seuil, la rangée n'apporte rien de plus que la grille complète). */
const MIN_MOVIES_PER_GENRE_ROW = 2;

/** Taille de la rangée « ajoutés récemment ». */
const RECENT_ROW_SIZE = 20;

/** Titre d'affichage d'un film : localisé si présent, sinon VO. */
export function displayTitle(movie: MovieListItem): string {
  return movie.titleVf ?? movie.titleVo;
}

/** Comparaison de titres pour le tri (accents/casse ignorés). */
function compareByTitle(a: MovieListItem, b: MovieListItem): number {
  return displayTitle(a).localeCompare(displayTitle(b), undefined, { sensitivity: 'base' });
}

@Injectable({ providedIn: 'root' })
export class BrowseStore {
  private readonly library = inject(LibraryStore);

  /** Tous les films affichables, triés par titre d'affichage. */
  readonly allMovies = computed(() => [...this.library.movies()].sort(compareByTitle));

  /** Rangée « ajoutés récemment » : derniers entrés dans l'index. */
  readonly recentlyAdded = computed(() =>
    [...this.library.movies()]
      .sort((a, b) => b.addedAt - a.addedAt)
      .slice(0, RECENT_ROW_SIZE),
  );

  /**
   * Rangées par genre : genres les plus fournis d'abord (égalité →
   * ordre alphabétique), films de chaque rangée triés par titre.
   */
  readonly genreRows = computed<GenreRow[]>(() => {
    const byGenre = new Map<string, MovieListItem[]>();
    for (const movie of this.allMovies()) {
      for (const genre of movie.genres) {
        const list = byGenre.get(genre);
        if (list === undefined) {
          byGenre.set(genre, [movie]);
        } else {
          list.push(movie);
        }
      }
    }
    return [...byGenre.entries()]
      .filter(([, movies]) => movies.length >= MIN_MOVIES_PER_GENRE_ROW)
      .sort(([genreA, moviesA], [genreB, moviesB]) =>
        moviesB.length - moviesA.length || genreA.localeCompare(genreB),
      )
      .slice(0, MAX_GENRE_ROWS)
      .map(([genre, movies]) => ({ genre, movies }));
  });
}
