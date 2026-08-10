# Rapport de phase 3 — UI « Netflix »

> Doc anti-crash : écrite PENDANT la phase, complétée à chaque étape.
> Branche `phase-3`, un commit par étape. PR #4 ouverte en fin de phase —
> validation utilisateur avant merge.

## Objectif de la phase

Transformer la liste brute de la phase 1 en vraie UI « façon Netflix » :
charte visuelle des deux thèmes, rangées d'affiches horizontales, fiche
détail cinéma (backdrop, casting, trailer), filtres et tris combinables,
et le wordmark définitif. Le tout 100 % hors ligne (seule exception
assumée : le trailer YouTube).

## Déroulé étape par étape

### 3.1 — Charte visuelle, header, navigation — FAIT

- Tokens Tailwind de charte dans `ui/src/tailwind.css` :
  `--color-brand` (rouge M0V13S, une seule valeur pour les deux thèmes) et
  `--color-brand-hover` → classes `text-brand`, `bg-brand`… ; utilitaire
  `scrollbar-hidden` pour les rangées.
- Header **sticky translucide** (backdrop-blur) : le contenu défile
  dessous en restant lisible, dans les deux thèmes.
- Navigation principale Accueil / Bibliothèque / Scanner avec état actif
  (`routerLinkActive`) ; **Bibliothèque masquée tant que le scan est
  forcé** (règle « présent ET reconnu », signal `forcedScan`).
- Le wordmark passe en couleur brand (police : étape 3.5).

### 3.2 — Browse : rangées + grille + cache de miniatures — FAIT

- **`thumbs.service` (reporté de 2.5, comme prévu)** : miniatures
  d'affiches en cache local `data\thumbs` (reconstructible), générées via
  `nativeImage` d'Electron — **aucune dépendance native supplémentaire**
  (leçon better-sqlite3). Largeur 342 px (convention TMDB w342), JPEG 82.
  - Invalidation SANS logique : le nom de cache est un hash de
    `relPath|mtime` — affiche remplacée → mtime différent → nouveau nom →
    régénération. Les orphelines s'accumulent (dossier purgeable, polish
    possible en phase 5).
  - Écriture atomique (tmp + rename) ; échec → repli silencieux sur
    l'image originale.
- Protocole `m0v13s-img` étendu : `img/<relPath>` (original) et
  `thumb/<relPath>` (miniature) ; mêmes garde-fous (extensions d'images,
  chemins strictement relatifs au lecteur). Pipe `sidecarImg` avec
  paramètre de variante.
- **`MovieListItem` enrichi** (décision documentée ci-dessous) : backdrop,
  notes (perso + TMDB), tags, réalisateurs/acteurs, date d'ajout
  (`media.createdAt`), état « vu » (`watch_state.completed`) — le browse
  travaille ensuite EN MÉMOIRE, sans IPC supplémentaire.
- `BrowseStore` (signaux/computed) : rangée « Ajoutés récemment » (20),
  rangées par genre (≥ 2 films, max 8 rangées, les plus fournies
  d'abord), grille complète triée par titre localisé (accents ignorés).
- Composants `MovieCard` (miniature, zoom + anneau brand au survol,
  pochette de repli) et `PosterRow` (défilement natif molette/tactile,
  chevrons de page au survol, barre de défilement masquée).

### 3.3 — Fiche détail « cinéma » — FAIT

- **Hero en carte arrondie** : backdrop sidecar + voile sombre CONSTANT
  (texte blanc) — une image de film reste sombre dans les deux thèmes,
  c'est la carte qui s'intègre à la page. Affiche pleine qualité, titres
  (localisé + VO), méta (année, durée du premier fichier, note TMDB, note
  perso), genres en chips, synopsis.
- Boutons du hero en **Tailwind pur** (pas Material) : les couleurs des
  boutons Material suivent le thème de l'app et deviendraient illisibles
  sur le hero sombre en thème clair.
- **Trailer YouTube embarqué** (`youtube-nocookie.com`, dialogue plein
  cadre noir) : online-only assumé (CLAUDE.md) — nouveau
  `ConnectivityService` (signal `navigator.onLine` + événements), bouton
  désactivé hors ligne avec mention dédiée ; clé validée par regex avant
  toute construction d'URL.
- Casting en cartes avatar-initiales (Unicode, pas de photos : les
  portraits ne sont pas des sidecars) avec le personnage ; tags en chips ;
  équipe et fichiers conservés.
- `MovieDetail` (DTO) expose désormais `trailerYoutubeKey` (déjà en DB).

### 3.4 — Filtres et tris combinables — FAIT

- État dans `BrowseStore` (signaux) : recherche libre (titres VO +
  localisé, **accents/casse ignorés** — normalisation NFD), genre, tag,
  réalisateur, acteur, année, tranche de durée (< 90, 90-120, 120-150,
  > 150 min — durée inconnue exclue des tranches), vu/pas vu. Tous les
  critères se **combinent en ET**.
- Tri : titre (défaut) / année / date d'ajout, sens inversable, valeurs
  inconnues toujours en fin de liste.
- Les listes d'options (genres, tags, personnes, années) sont dérivées de
  la bibliothèque elle-même.
- UI : `BrowseFilters` en champs Material (charte : Material pour les
  formulaires), compteur de résultats, bouton de remise à zéro. Dès qu'un
  critère (ou le tri) s'écarte du défaut, la grille de résultats remplace
  les rangées. **L'état persiste entre navigations** (store racine) : on
  retrouve ses filtres en revenant d'une fiche.

### 3.5 — Wordmark « M0V13S » — FAIT (choix utilisateur : Space Mono)

- Les trois candidates (JetBrains Mono / Fira Code / Space Mono, licence
  OFL) installées via `@fontsource` — même mécanique bundlée hors-ligne
  que Roboto.
- Comparaison visuelle fournie à l'utilisateur (les deux thèmes, glyphes
  discriminants 0O / 1Il / 3B / 5S).
- **Space Mono 700 choisie par l'utilisateur** (zéro barré très visible,
  dessin le plus « identité ») via le token `--font-wordmark` + entrée
  styles d'`angular.json` → classe `font-wordmark` sur le wordmark du
  header. Les deux dépendances non retenues ont été retirées.

### 3.6 — Fin de phase (ce commit)

- Dépendances : Angular 22.1.0 → 22.1.1 (via `ng update`), CLI/build
  22.1.3, ag-grid 36.1, postcss 8.5.26 (corrige l'avis nanoid —
  `pnpm audit` : 0 vulnérabilité), jsdom 30 (dev), @types/node, esbuild.
  **TypeScript 7 toujours exclu** (Angular 22.1 exige ~6.0). Ni Electron
  ni better-sqlite3/Drizzle à monter — pas de rebuild natif.
- Portabilité revalidée : `pnpm package` puis lancement de l'exe
  (`ELECTRON_RUN_AS_NODE` retiré) — fenêtre visible, processus stable.
- Docs à jour (TODO.md, REPRISE.md, ce rapport), PR #4 ouverte.

## Décisions prises en cours de phase (documentées, non bloquantes)

1. **Filtrage côté UI plutôt que SQL** : la liste des films embarque tout
   (genres, tags, personnes, vu, date d'ajout). Bibliothèque locale de
   quelques centaines/milliers de fiches → tout tient en mémoire, et les
   filtres combinés réagissent instantanément sans aller-retour IPC sur
   un disque dur externe lent. Les rangées de suggestions de la phase 5
   (5.1) resteront des requêtes SQL dédiées.
2. **Seuils des rangées de genres** : rangée à partir de 2 films, max 8
   rangées (les plus fournies d'abord) — en dessous, la rangée n'apporte
   rien de plus que la grille.
3. **Cache de miniatures auto-invalidant** par hash `relPath|mtime` (pas
   de table ni de logique d'invalidation) — orphelines purgeables en
   phase 5 si besoin.
4. **Voile sombre constant sur le hero** de la fiche : lisibilité
   garantie sur n'importe quel backdrop, dans les deux thèmes ; les
   boutons posés sur le hero sont en Tailwind pur pour la même raison.
5. **Trailer embarqué** (youtube-nocookie + `navigator.onLine`) plutôt
   qu'ouvert dans le navigateur : l'expérience reste dans l'app ; hors
   ligne, bouton désactivé + mention (jamais d'erreur).
6. **Filtres à valeur unique par critère** (un genre, un acteur…) — la
   combinaison ENTRE critères couvre les usages réels ; multi-sélection
   par critère envisageable plus tard si besoin.

## État des tests

- **113 tests backend** (dont nouveaux : `library.service` sur DB
  temporaire — règle « présent ET reconnu », enrichissement browse,
  multi-fichiers ; `thumbs.logic`) et **23 tests UI** (dont
  `browse.store` : rangées, 10 cas de filtres/tris) — tous verts.
- Typecheck strict, build prod et packaging OK.

## Ajustements post-validation (retour utilisateur du 2026-08-09)

Premier retour : « pas mal du tout », avec trois ajustements.

1. **Police du wordmark confirmée** : Space Mono (choix acté, dépendances
   inutiles retirées).
2. **Langues audio et sous-titres des fichiers** (demande utilisateur) :
   - ffprobe extrait les langues des pistes audio et sous-titres (tags
     ISO 639-2 du conteneur, dédupliquées ; `und` et pistes non taguées
     ignorées) ;
   - colonnes JSON `audio_langs` / `subtitle_langs` sur `video_files`
     (migration 0003) — null = fichier analysé avant l'ajout de l'info,
     **un scan complet re-analyse et remplit** ;
   - fiche : ligne « Audio / Sous-titres » dans le hero (union des
     fichiers) + badges par fichier (utile en multi-versions) ; noms de
     langues traduits dans la langue de l'UI via `Intl.DisplayNames`
     (hors ligne, mapping 639-2B/T → 639-1, code inconnu affiché tel
     quel). Décision : ces données techniques ne vont PAS dans les
     `.nfo` (re-dérivables du fichier lui-même, qui voyage avec le
     dossier).
3. **Material harmonisé en thème sombre** (retours utilisateur en deux
   temps) : la première tentative (second `mat.theme` complet en palette
   orange scopé `html.dark`) donnait un primaire orange délavé ET
   re-teintait toutes les surfaces neutres (« filtre orange » sur le
   fond, relevé sur capture). Correction : le thème de base (cyan,
   color-scheme) reste seul maître des surfaces ; `html.dark` ne porte
   plus que des `mat.theme-overrides` CIBLÉS sur la famille primaire,
   avec l'ambre VIF du wordmark (mêmes valeurs que `--color-brand` /
   `--color-on-brand`). Fond identique à avant, accents ambre francs.
   Complément (troisième retour) : `secondary-container` surchargé aussi
   (état sélectionné des button-toggle langue/tables, resté bleuté), et
   `accentColor` d'ag-grid aligné sur la charte dans les deux thèmes
   (survol/sélection de ligne, coches — le bleu par défaut de quartz).
4. **Trailer ET langues éditables manuellement** (demandes utilisateur :
   TMDB n'a pas toujours de trailer, les pistes ne sont pas toujours
   taguées) — dans l'édition manuelle de la fiche :
   - champ « Trailer YouTube » : URL (watch, youtu.be, embed, format
     Kodi) ou clé brute, parsée côté UI (`parseYoutubeKey`, mêmes
     formats que le parseur `.nfo`) ; vide = retirer le trailer ;
   - chips « Langues audio » / « Langues des sous-titres » (codes : fr,
     en, jpn… normalisés en minuscules), préremplies avec la détection
     ffprobe et appliquées au premier fichier de la fiche (celui que
     l'édition recharge — les multi-parties gardent leurs pistes
     propres détectées au scan).
   `ManualEditInput` porte désormais `trailerYoutubeKey`, `audioLangs`
   et `subtitleLangs`.
   Complément (second retour) — mêmes possibilités dans l'ASSISTANT DE
   SCAN : champ « Trailer YouTube » (prérempli par la fiche existante,
   TMDB ne le remplace QUE s'il en a trouvé un — un lien saisi à la main
   survit aussi à « Compléter via TMDB » sans résultat, appliqué dans
   `enrichMedia`) et chips de langues préremplies par ffprobe, avec
   repli sur les valeurs en base quand les pistes ne sont pas taguées
   (`ExistingFiche.audioLangs/subtitleLangs`) — des langues saisies à la
   main survivent ainsi à un scan complet.
5. **Identité couleur propre** (le rouge faisait trop « Netflix ») :
   quatre pistes proposées sur maquettes bi-thèmes ; **choix utilisateur :
   identité BI-THÈME — sarcelle « écran » en thème clair, ambre
   « projecteur » en thème sombre**, portée par `light-dark()` dans les
   tokens (`--color-brand`, `--color-brand-hover`). Nouveau token
   `--color-on-brand` (texte sur fond brand : blanc sur sarcelle,
   quasi-noir sur ambre — contraste garanti, notamment le bouton trailer
   sur le hero). Material aligné : primaire cyan (famille sarcelle),
   tertiaire orange (famille ambre).

## Validation utilisateur attendue (avant merge de la PR #4)

1. `git pull` sur `phase-3`, `nvm use 22.23.2`, `pnpm i`, `pnpm dev`.
2. **Header** : navigation (état actif), thème light/dark, langue FR/EN.
3. **Browse** : rangées (récents, genres) au chargement, défilement
   molette + chevrons, miniatures nettes (dossier `data\thumbs` créé),
   grille complète en bas.
4. **Filtres** : combiner (ex. genre + acteur), recherche avec/sans
   accents, tranches de durée, tri année décroissant, bouton reset ;
   revenir d'une fiche → filtres conservés.
5. **Fiche** : hero backdrop + affiche, casting avec personnages, chips,
   trailer en ligne (et bouton grisé si hors ligne), édition manuelle et
   « Compléter via TMDB » toujours fonctionnels.
6. **Wordmark** : donner le choix de police (Space Mono par défaut).
7. Si tout est bon : merge de la PR #4 → phase 4 (lecture VLC & suivi).
