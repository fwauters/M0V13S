# Rapport de phase 2 — Sidecars & enrichissement TMDB

> Doc vivante anti-crash : mise à jour à chaque étape, statut ci-dessous.

**Statut : EN COURS** — démarrée après merge de la PR #2 (phase 1 validée
avec 5 correctifs de validation). Branche `phase-2`, un commit par étape.

## Objectif de la phase

Les dossiers de contenu deviennent réellement LE maître (principe
fondateur n° 2) : chaque fiche s'écrit en sidecar `.nfo` (XML Kodi) à côté
de sa vidéo, les images (poster/fanart) arrivent en sidecars via TMDB, et
un dossier partagé complet se réimporte silencieusement, hors ligne. La
clé API TMDB est saisie par l'utilisateur et vit dans `settings` — jamais
commitée.

## Déroulé étape par étape

### 2.1 — nfo.service (lecture/écriture XML Kodi, atomique) — FAIT
- `fast-xml-parser` (pur JS) ; fiche `MovieNfo` complète : titres VO/VF,
  année, synopsis, note perso, tmdbId (`<uniqueid type="tmdb">`),
  réalisateurs, scénaristes (`<credits>`), acteurs (+ personnage + ordre),
  genres, tags. `watch_state` jamais exporté (personnel).
- Écriture ATOMIQUE (tmp + rename, même dossier) ; parseur TOLÉRANT :
  balises inconnues ignorées (Kodi/Jellyfin/tinyMediaManager), valeur
  unique normalisée en tableau, uniqueid imdb ignoré au profit du tmdb,
  XML illisible ou racine non-movie → null (jamais d'exception).
- Piège évité : `parseTagValue: false` — un titre « 1917 » reste une
  chaîne. 7 tests (aller-retour complet et minimal, fixture Kodi réelle,
  invalides, écriture disque atomique sans résidu .tmp).
### 2.2 — Import silencieux des `.nfo` au scan — FAIT
- Le scénario « partage » fonctionne : un fichier arrivé avec son `.nfo`
  est importé pendant le scan, sans question, HORS LIGNE. L'import passe
  APRÈS le calcul des re-liens (un renommage garde sa fiche au lieu d'en
  créer une seconde) et NE réécrit PAS le `.nfo` existant (préserve les
  champs d'autres outils qu'on ne modélise pas).
- `qualify()` écrit désormais le sidecar `.nfo` à chaque qualification
  (règle : sidecars = reflet exact de l'index) — échec d'écriture non
  bloquant (rattrapé à la prochaine édition).
- Déduplication des fiches par `tmdbId` (CD1/CD2 partagés, enrichissement
  à venir) ; les acteurs portent leur PERSONNAGE (venu des `.nfo`, bientôt
  de TMDB) ; racine de lecteur injectable pour tester sur dossier
  temporaire. UI : section « Importés automatiquement (n) » dans le scan.
- 5 nouveaux tests (import, non-réimport, non-réécriture du .nfo,
  regroupement par tmdbId, écriture du .nfo au qualify).

### Décision en cours de phase (validée avec l'utilisateur)
La **clé API TMDB se gère DANS l'app** (pas seulement en phase 5) : carte
sur l'écran d'accueil — saisie, statut masqué, bouton « Tester » (3 états :
valide / invalide / hors ligne). Canal IPC dédié : la clé complète ne
redescend jamais au renderer (statut masqué uniquement).
### 2.3a — Clé API TMDB gérée dans l'app — FAIT
- `TmdbService` (fetch injectable, testé sans réseau) : statut MASQUÉ
  (`****7890`), enregistrement (clé vide = effacement), test de validité
  contre `/3/configuration` avec 3 verdicts : `valid` / `invalid` /
  `offline` (timeout 8 s — offline-first, la clé saisie hors ligne reste
  enregistrée et testable plus tard).
- Canal IPC DÉDIÉ `tmdb:*` : la clé complète ne redescend jamais au
  renderer. Carte sur l'écran d'ACCUEIL (choix utilisateur) : statut,
  ajout/remplacement (champ type password), bouton « Tester », test
  automatique après enregistrement, mention d'attribution TMDB.
- 9 tests (masquage, statut, effacement, verdicts, clé candidate).

### Ajout en cours de phase — Scan complet forcé (demande utilisateur)
- Case « Scan complet » à côté de « Lancer le scan » : les fichiers DÉJÀ
  indexés repassent dans l'assistant, PRÉREMPLIS avec leur fiche
  existante (badge « Fiche existante — l'enregistrement la mettra à
  jour »). C'est aussi, de fait, l'édition de fiche via re-scan.
- `qualify()` détecte un `relPath` déjà indexé → MISE À JOUR de la fiche
  (champs + relations remplacées + fichier + réécriture `.nfo`), jamais
  de doublon. Le `tmdbId` et les personnages d'acteurs connus sont
  préservés lors d'une mise à jour manuelle.
- Garde-fous : en scan complet, les fichiers indexés ne participent pas
  aux re-liens et leurs `.nfo` ne sont pas ré-importés. 3 nouveaux tests.

### 2.3b — tmdb.service : recherche, détails, mapping — FAIT
- Recherche fr-FR (titre + année, 8 résultats max, vignettes
  image.tmdb.org) ; détails en UN appel (`append_to_response=
  credits,videos`) mappés vers notre schéma : VO/VF, genres, réalisateurs
  (job Director), scénaristes (département Writing, dédoublonnés), casting
  principal AVEC personnages (ordre TMDB), trailer YouTube (fr
  prioritaire), chemins d'images pour 2.5.
- Statuts typés `noKey`/`invalidKey`/`unavailable` — jamais d'exception
  vers l'UI ; fonctions de mapping PURES testées sur fixtures réalistes.
- Le trailer YouTube voyage désormais partout : schéma (`media`), `.nfo`
  (balise <trailer> format plugin Kodi, parseur multi-formats), saisie de
  qualification. 10 nouveaux tests.

### 2.4 — UI scan : recherche TMDB + choix du film — FAIT
- Dans l'assistant : recherche AUTO-lancée par fichier (requête = titre
  deviné/fiche), champ modifiable + bouton Rechercher ; liste de choix
  avec vignettes d'affiches, titre fr + VO + année + synopsis ;
  **l'utilisateur choisit toujours** — jamais d'application automatique.
- Choix d'un résultat → détails complets → fiche préremplie (tags et note
  perso CONSERVÉS — champs personnels), tout reste modifiable ; le
  tmdbId, le trailer et les personnages suivent la fiche appliquée.
- Messages clairs par statut : pas de clé (→ accueil), clé refusée,
  hors ligne (fiche manuelle possible), aucun résultat.
### 2.5 — Poster/fanart en SIDECARS — FAIT
- Convention Kodi : `<nom>-poster.jpg` / `<nom>-fanart.jpg` à côté de la
  vidéo — le dossier de film est autonome et partageable.
- À la qualification avec fiche TMDB appliquée : téléchargement (poster
  w780, fanart w1280), écriture atomique, échec réseau silencieux avec
  repli sur les images déjà présentes. À l'import `.nfo` (hors ligne) :
  détection fs des sidecars arrivés avec le dossier.
- Chemins RELATIFS au lecteur enregistrés dans `media.posterPath`/
  `backdropPath` — reflet exact du disque. 6 tests (fetch mocké).
- **Écart assumé** : le cache de miniatures (`thumbs.service`) est
  reporté en phase 3 (3.2), où la grille le consommera — il exige aussi
  le protocole de service des images au renderer (décision phase 3).
### 2.6 — Scan hors-ligne + « réessayer l'enrichissement » — À VENIR
### 2.7 — Fin de phase (deps, docs, portabilité, PR) — À VENIR
