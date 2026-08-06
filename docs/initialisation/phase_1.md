# Rapport de phase 1 — Bibliothèque locale & conformité

> Doc vivante anti-crash : mise à jour à chaque étape, statut ci-dessous.

**Statut : LIVRÉE** — étapes 1.1 → 1.12 faites et committées (un commit par
étape, branche `phase-1`, PR #2). Reste la validation utilisateur de fin de
phase (test rapide du build portable, puis merge).

## Objectif de la phase

La bibliothèque locale fonctionne de bout en bout SANS internet ni TMDB :
schéma complet films + séries, scan de conformité au lancement (règle
« présent ET reconnu »), scanner avec qualification manuelle, liste des
films dans l'UI, vue admin des tables (lecture seule).

## Déroulé étape par étape

### 1.1 — Schéma Drizzle complet (commit `bff9826`)
- 12 tables (PLAN § 5) : `media` unifiée films/séries, `seasons`/`episodes`
  (prêtes, non exercées en v1), `video_files` 1-N avec `partNumber` et
  CHECK « exactement un propriétaire », jonctions people/genres/tags,
  `watch_state` par film OU épisode, `settings`.
- Clés étrangères ACTIVÉES (pragma — SQLite ne le fait pas par défaut),
  cascades testées, CHECK testés, fermeture propre de la connexion
  (handle `close`, flush WAL au quit — important sur disque débranchable).

### 1.2 — paths.service complet (commit `f7e6454`)
- `VIDEO_EXTENSIONS` + `isVideoFile` (base du scanner), chemins des outils
  embarqués (ffprobe, VLC) relatifs à la racine app.

### 1.3 — settings.service + persistance réelle (commit `76a8679`)
- Accès typé à `settings` (upsert, JSON tolérant, racines de bibliothèque).
- IPC restreint par LISTE BLANCHE aux clés d'UI (`ui.theme`, `ui.lang`) —
  les clés sensibles ne transitent jamais par ces canaux.
- Thème et langue désormais persistés EN BASE : le choix voyage avec le
  disque ; localStorage conservé comme cache anti-flash au démarrage.

### 1.4 — filename.service (commit `dc4e772`)
- Parsing pur des noms de release : jargon « dur » (coupe tout ce qui
  suit : 1080p, BluRay, x265…) et « mou » (filtré : MULTI, VOSTFR…),
  dernière année plausible hors début de nom (gère « 2001 A Space
  Odyssey 1968 » et « 1917 » sans année), parties CD1/CD2, détection des
  épisodes S01E02/1x05. 15 cas de tests, pièges français inclus.

### 1.5 — ffprobe.service (commit `c032786`)
- `parseFfprobeOutput` pur testé sur fixtures (MKV multi-flux, champs
  manquants, durée N/A) ; `probeFile` via ffprobe embarqué, timeout 30 s.

### 1.6 — Conformité au lancement (commit `e6b9242`)
- Walker : listing disque SEUL (aucune lecture de contenu — rapide sur
  HDD), tolérant aux racines absentes ; testé sur arbre temporaire réel.
- Diff pur `présent/manquant/inconnu` + mise à jour des statuts
  (`ok`/`missing`, un fichier revenu redevient `ok` automatiquement).
- AUCUN import ici : l'écriture d'index reste exclusive au mode Scanner.

### 1.7 — Scanner + bibliothèque + IPC (commit `ab459cc`)
- Scan asynchrone avec progression (événement main → renderer) et
  annulation entre deux fichiers.
- Qualification manuelle TRANSACTIONNELLE : média + fichier + personnes/
  genres/tags en find-or-create (pas de doublons de référentiels) ;
  rattachement automatique des parties CD1/CD2 à la fiche existante.
- Re-liens probables (taille identique + durée quand connue), suppression
  de fiche uniquement sur confirmation.
- LibraryService : la règle « présent ET reconnu » est appliquée DANS la
  requête SQL (inner join sur fichiers `ok`).
- Vue admin backend : lecture seule, liste blanche stricte de tables,
  plafond 5000 lignes.

### 1.8 — Routing + accueil + scan forcé (commit `ac381d5`)
- Routes lazy par feature ; guard du mode classique : attend le contrôle
  de conformité et redirige vers /scan si RIEN n'est reconnu.
- LibraryStore (signaux) : conformité mémoïsée (1 exécution par
  lancement), testée avec un double d'ApiService.
- Accueil : les 2 options de la spec + notices (à qualifier, manquants,
  scan forcé).

### 1.9 — Assistant de scan (commit `cd5a673`)
- Éditeur des racines (chemins relatifs, la lettre de lecteur est
  interdite par principe), scan avec barre de progression Material et
  bouton d'annulation.
- Re-liens en un clic ; suppression via dialogue de confirmation Material
  (textes traduits côté appelant, dialogue générique réutilisable).
- Wizard fichier par fichier : identité disque + infos ffprobe, formulaire
  Material prérempli par le parsing du nom, listes en CHIPS réutilisables
  (composant `app-chips-input`, ajout Entrée/virgule).
- Épisodes de série détectés : signalés et écartés (v1 films seulement).

### 1.10 — Liste + fiche (commit `faf072d`)
- Grille de cartes cliquables (titre VF/VO, année, durée, genres), fiche
  lecture seule complète (équipe par rôle précalculée en `computed`,
  fichiers multi-parties avec statut et badge « introuvable »).
- Pipes purs `minutes` et `join` — respect strict de la règle « aucun
  appel de méthode en template ».

### 1.11 — Vue admin ag-grid (commit `9b20261`)
- ag-grid Community en lazy (chunk dédié ~2 Mo hors bundle initial),
  sélecteur de table (liste blanche alignée), tri/filtre/virtualisation,
  thème quartz suivant le signal light/dark de l'app.

### 1.12 — Fin de phase (ce commit)
- Packaging vérifié : build portable copié ailleurs → fenêtre vivante,
  DB créée/migrée à côté de l'exe.
- `pnpm outdated` : seul TypeScript 7 (majeure) est disponible — hors
  périmètre (Angular 22.1 exige ~6.0), à revoir avec la montée Angular.
- `pnpm audit --prod` : aucune vulnérabilité connue.
- Docs à jour (TODO coché, ce rapport), PR #2 ouverte.

## Écarts au plan / notes

- La correction d'encodage d'un fichier réécrit via PowerShell a rappelé
  une règle d'outillage : ne JAMAIS réécrire un fichier UTF-8 avec
  `Set-Content` (mojibake) — les outils d'édition dédiés s'en chargent.
- Le formulaire de qualification utilise ngModel + signaux (pas de
  Reactive Forms) : suffisant pour ce formulaire, à réévaluer si la
  validation se complexifie en phase 2 (TMDB).
- `personalRating`, prévu au schéma, est saisissable dès maintenant dans
  l'assistant.

## Corrections post-validation (retour utilisateur du 2026-08-06)

Trois bugs relevés lors du test utilisateur, corrigés sur la branche avant
merge (commit `fix(phase1)`) :

1. **Formulaire du wizard non réinitialisé** entre deux fichiers : le bloc
   `@if` réutilisait les mêmes widgets (ngModel, chips) d'un fichier à
   l'autre — en zoneless, leur remise à zéro n'était pas garantie.
   Correctif : sous-arbre du formulaire RECRÉÉ à chaque fichier
   (`@for … track file.relPath`). Non-régression : `scan.spec.ts`
   (brouillon réinitialisé après enregistrement ET après skip).
2. **Réalisateur/scénariste absents de la fiche** quand peu de champs
   remplis : une valeur tapée dans un champ chips sans être validée par
   Entrée/virgule était PERDUE (cas typique des champs à valeur unique).
   Correctif : `matChipInputAddOnBlur` — la perte de focus (clic sur
   Enregistrer…) ajoute la valeur au lieu de la jeter.
3. **Vue admin sans lignes** (seul le compteur s'affichait) : l'élément
   hôte des composants de feature ne relayait pas la chaîne flex du layout
   → hauteur non propagée → ag-grid (100 % interne) rendu VIDE. Correctif :
   `host: { class: 'flex grow flex-col' }` sur les cinq features (layout
   cohérent partout), la grille récupère une vraie hauteur.

Au passage : import cassé corrigé dans `library.store.spec.ts`
(ApiService déplacé dans `core/services/` pendant la phase).

4. **`pnpm dev` n'ouvrait jamais la fenêtre Electron** (l'utilisateur
   testait donc dans un navigateur, où le backend n'existe pas par
   conception). Deux causes cumulées + un durcissement :
   - wait-on attendait `file:dist-electron/main.cjs` — préfixe invalide,
     interprété comme un nom de fichier littéral jamais créé → attente
     infinie, sans erreur. Corrigé en chemin nu.
   - `ng serve` écoute `localhost` (résolu IPv6 `::1` sur la machine)
     alors que wait-on testait `127.0.0.1` (IPv4) → jamais satisfait.
     Corrigé en IPv4 EXPLICITE de bout en bout : `ng serve --host
     127.0.0.1`, `wait-on tcp:127.0.0.1:4200`, `loadURL` idem.
   - Nouveau `scripts/start-electron.mjs` : lance Electron avec un
     environnement assaini (suppression d'`ELECTRON_RUN_AS_NODE` hérité
     des terminaux VS Code — le piège documenté en phase 0).
   Vérifié en réel cette fois : `pnpm dev` → fenêtre Electron ouverte.
   Également : validation des racines de bibliothèque (lettre de lecteur
   refusée avec message + exemples concrets dans les hints).

## Validation utilisateur attendue (avant merge)

1. `nvm use 22.23.2` puis `pnpm dev` : vérifier accueil → scan forcé au
   premier lancement, configuration d'une racine, scan d'un dossier de
   vidéos, qualification d'un film, apparition dans « Ma bibliothèque »,
   fiche, vue admin des tables.
2. Optionnel (rituel complet) : `pnpm package` + test sur machine B.
3. Merge de la PR #2 → phase 2 (sidecars .nfo + TMDB).
