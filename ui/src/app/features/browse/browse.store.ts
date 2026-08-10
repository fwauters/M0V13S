import { Injectable, computed, inject, signal } from '@angular/core';
import type { MovieListItem } from '@shared/dto';

import { LibraryStore } from '../../core/library.store';

/**
 * Store (signaux) du browse « façon Netflix » : dérive les rangées ET les
 * résultats filtrés/triés de la liste des films portée par LibraryStore.
 * Tout est calculé en mémoire (computed) — la liste est chargée une fois,
 * rangées et filtres combinables réagissent instantanément.
 * Le store est racine : les filtres SURVIVENT à un aller-retour vers une
 * fiche (on retrouve sa recherche en revenant).
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

/** Normalisation pour la recherche : casse ET accents ignorés —
 *  décomposition NFD puis suppression des diacritiques combinants
 *  (U+0300 à U+036F), sans regex pour rester lisible. */
function normalize(text: string): string {
  let result = '';
  for (const ch of text.normalize('NFD')) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x0300 || code > 0x036f) {
      result += ch;
    }
  }
  return result.toLocaleLowerCase();
}

/** Tranches de durée du filtre (bornes en minutes, incluses). */
export type DurationBucket = 'all' | 'lt90' | 'b90to120' | 'b120to150' | 'gt150';

/** Filtre d'état de visionnage. */
export type SeenFilter = 'all' | 'seen' | 'unseen';

/** Clés de tri de la grille de résultats. */
export type SortKey = 'title' | 'year' | 'added';

/** Vrai si la durée (secondes, nullable) tombe dans la tranche.
 *  Une durée inconnue ne matche AUCUNE tranche (hors `all`). */
function matchesDuration(durationSec: number | null, bucket: DurationBucket): boolean {
  if (bucket === 'all') {
    return true;
  }
  if (durationSec === null) {
    return false;
  }
  const minutes = durationSec / 60;
  switch (bucket) {
    case 'lt90':
      return minutes < 90;
    case 'b90to120':
      return minutes >= 90 && minutes <= 120;
    case 'b120to150':
      return minutes > 120 && minutes <= 150;
    case 'gt150':
      return minutes > 150;
  }
}

/** Valeurs distinctes triées d'un champ multi-valué de la liste. */
function distinctSorted(movies: MovieListItem[], pick: (m: MovieListItem) => string[]): string[] {
  const values = new Set<string>();
  for (const movie of movies) {
    for (const value of pick(movie)) {
      values.add(value);
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
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

  /* --------------- filtres et tris combinables (TODO 3.4) ------------ */

  /** Recherche libre sur les titres (VO + localisé), accents ignorés. */
  readonly search = signal('');
  /** Filtres à valeur unique (null = « tous ») — combinables entre eux. */
  readonly genre = signal<string | null>(null);
  readonly tag = signal<string | null>(null);
  readonly director = signal<string | null>(null);
  readonly actor = signal<string | null>(null);
  readonly year = signal<number | null>(null);
  readonly duration = signal<DurationBucket>('all');
  readonly seen = signal<SeenFilter>('all');
  /** Tri de la grille de résultats. */
  readonly sortKey = signal<SortKey>('title');
  readonly sortDesc = signal(false);

  /** Valeurs proposées par les listes déroulantes (issues de la bibliothèque). */
  readonly allGenres = computed(() => distinctSorted(this.library.movies(), (m) => m.genres));
  readonly allTags = computed(() => distinctSorted(this.library.movies(), (m) => m.tags));
  readonly allDirectors = computed(() =>
    distinctSorted(this.library.movies(), (m) => m.directors),
  );
  readonly allActors = computed(() => distinctSorted(this.library.movies(), (m) => m.actors));
  /** Années présentes, décroissantes. */
  readonly allYears = computed(() => {
    const years = new Set<number>();
    for (const movie of this.library.movies()) {
      if (movie.year !== null) {
        years.add(movie.year);
      }
    }
    return [...years].sort((a, b) => b - a);
  });

  /** Vrai si au moins un critère s'écarte du défaut → la grille de
   *  résultats remplace les rangées (le tri seul compte aussi : les
   *  rangées ont leur ordre propre et ne sauraient le refléter). */
  readonly filtering = computed(
    () =>
      this.search().trim() !== '' ||
      this.genre() !== null ||
      this.tag() !== null ||
      this.director() !== null ||
      this.actor() !== null ||
      this.year() !== null ||
      this.duration() !== 'all' ||
      this.seen() !== 'all' ||
      this.sortKey() !== 'title' ||
      this.sortDesc(),
  );

  /** Résultats : tous les critères appliqués en ET, puis le tri. */
  readonly filtered = computed(() => {
    const query = normalize(this.search().trim());
    const genre = this.genre();
    const tag = this.tag();
    const director = this.director();
    const actor = this.actor();
    const year = this.year();
    const duration = this.duration();
    const seen = this.seen();

    const results = this.allMovies().filter(
      (m) =>
        (query === '' ||
          normalize(m.titleVo).includes(query) ||
          (m.titleVf !== null && normalize(m.titleVf).includes(query))) &&
        (genre === null || m.genres.includes(genre)) &&
        (tag === null || m.tags.includes(tag)) &&
        (director === null || m.directors.includes(director)) &&
        (actor === null || m.actors.includes(actor)) &&
        (year === null || m.year === year) &&
        matchesDuration(m.durationSec, duration) &&
        (seen === 'all' || (seen === 'seen') === m.seen),
    );

    // Tri : la base est déjà par titre ; année/ajout re-trient (valeurs
    // inconnues en dernier, quel que soit le sens), puis inversion.
    const sortKey = this.sortKey();
    if (sortKey === 'year') {
      results.sort((a, b) => (a.year ?? Number.MAX_SAFE_INTEGER) - (b.year ?? Number.MAX_SAFE_INTEGER));
    } else if (sortKey === 'added') {
      results.sort((a, b) => a.addedAt - b.addedAt);
    }
    if (this.sortDesc()) {
      // Les années inconnues repassées en fin de liste après inversion.
      const known = results.filter((m) => sortKey !== 'year' || m.year !== null).reverse();
      const unknown = sortKey === 'year' ? results.filter((m) => m.year === null) : [];
      return [...known, ...unknown];
    }
    return results;
  });

  /** Remet tous les critères (filtres ET tri) à leur défaut. */
  resetFilters(): void {
    this.search.set('');
    this.genre.set(null);
    this.tag.set(null);
    this.director.set(null);
    this.actor.set(null);
    this.year.set(null);
    this.duration.set('all');
    this.seen.set('all');
    this.sortKey.set('title');
    this.sortDesc.set(false);
  }
}
