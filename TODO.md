# TODO — M0V13S, étape par étape

> **Règle de travail** : une étape à la fois. Chaque étape est proposée à
> l'utilisateur, **validée avant exécution**, puis cochée ici une fois livrée
> et vérifiée. Ce fichier est une doc vivante : il est mis à jour à chaque
> évolution du plan (`PLAN.md` § 7 reste la référence des phases).

## Phase 0 — Squelette portable

*Critère de sortie : l'exe tourne depuis une clé USB sur une autre machine, hors ligne.*

- [x] **0.1** Structure du workspace : `package.json` racine (pnpm), dossiers
  `electron\` / `ui\` / `shared\` / `scripts\`, TypeScript strict partagé.
- [x] **0.2** Workspace Angular 22 dans `ui\` (standalone, signals) + Tailwind v4.
- [x] **0.3** Angular Material : thème M3 light/dark de base (tokens), Roboto et
  icônes bundlées en local, cohabitation preflight Tailwind ↔ Material réglée.
- [x] **0.4** Transloco : squelette `fr.json` / `en.json`, service de langue,
  changement à chaud (persistance branchée plus tard sur `settings`).
- [x] **0.5** Process main Electron (TS) : fenêtre, chargement UI dev
  (localhost + hot reload) / prod (`file://`), scripts `pnpm dev`.
- [x] **0.6** IPC typé de bout en bout : contrat dans `shared\`, preload
  `contextBridge`, `window.api`, appel de démonstration (ping/pong).
- [x] **0.7** SQLite branché : better-sqlite3 (N-API, aucun rebuild natif
  nécessaire) + Drizzle, `paths.service` v1 (résolution exe → `data\` en dev
  et en prod), DB créée à côté de l'exe, première migration.
- [x] **0.8** Socle de tests Vitest (electron + ui) : premiers tests
  `paths.service` + test de complétude i18n.
- [x] **0.9** Script `prepare-tools` : téléchargement de VLC portable + ffprobe
  dans `tools\` (jamais commités) — validé en réel pour ffprobe.
- [ ] **0.10** Packaging portable (electron-builder) : build « dossier » copiable,
  vérification locale depuis un autre emplacement disque.
- [ ] **0.11** ✅ **Test de portabilité réel** : copie sur disque externe,
  lancement sur une machine B **hors ligne** (test fait par l'utilisateur).
- [ ] **0.12** Fin de phase : `pnpm outdated` / `audit`, section « Commandes » de
  `CLAUDE.md` remplie, docs à jour, commit + push.

## Phase 1 — Bibliothèque locale & conformité

- [ ] **1.1** Schéma Drizzle complet (PLAN § 5) + migrations + tests de migration.
- [ ] **1.2** `paths.service` complet : chemins relatifs à la racine du lecteur,
  interdiction des chemins absolus, tests.
- [ ] **1.3** `settings.service` (racines de bibliothèque, thème, langue, clé
  TMDB, hash admin) + IPC + tests.
- [ ] **1.4** `filename.service` : parsing titre/année depuis le nom de fichier
  + tests (batterie de cas réels).
- [ ] **1.5** `ffprobe.service` : durée, codecs, résolution + tests sur fixtures.
- [ ] **1.6** `conformity.service` : scan rapide au lancement — règle « présent
  ET reconnu », notice « X à qualifier », scan forcé si index vide + tests.
- [ ] **1.7** `scanner.service` : nouveaux / manquants / renommés (re-lien) +
  suppression sur confirmation + tests.
- [ ] **1.8** UI : écran d'accueil (« Lancer » / « Scanner »), redirection scan
  forcé.
- [ ] **1.9** UI : assistant de scan minimal — formulaire de fiche 100 % manuel
  (Material), sans API.
- [ ] **1.10** UI : liste brute des films + fiche sommaire (données réelles).
- [ ] **1.11** Vue admin des tables DB en lecture seule (ag-grid Community).
- [ ] **1.12** Fin de phase : deps, docs, test de portabilité, push.

## Phase 2 — Sidecars & enrichissement TMDB

- [ ] **2.1** `nfo.service` : lecture/écriture `.nfo` (XML Kodi), écritures
  atomiques, parseur tolérant + tests.
- [ ] **2.2** Import silencieux en masse des fichiers arrivés avec `.nfo`
  (+ images) — le scénario « partage » fonctionne, hors ligne + tests.
- [ ] **2.3** `tmdb.service` : recherche (titre + année, fr-FR), détails,
  mapping vers le schéma + tests (HTTP mocké).
- [ ] **2.4** UI scan : recherche TMDB, choix du bon film (vignettes),
  préremplissage du formulaire, recherche manuelle.
- [ ] **2.5** Téléchargement poster/fanart **en sidecars** + `thumbs.service`
  (cache de miniatures régénérable) + tests.
- [ ] **2.6** Scan hors-ligne : fiches manuelles + bouton « réessayer
  l'enrichissement TMDB » sur fiche.
- [ ] **2.7** Fin de phase : deps, docs, portabilité, push.

## Phase 3 — UI « Netflix »

- [ ] **3.1** Charte visuelle des deux thèmes : layout global, header
  (interrupteurs thème + langue), navigation.
- [ ] **3.2** Browse : grille d'affiches + rangées horizontales (miniatures cache).
- [ ] **3.3** Fiche détail complète : backdrop, casting, genres, tags, trailer
  YouTube (en ligne) / mentions hors-ligne.
- [ ] **3.4** Filtres et tris combinables : genre, tag, acteur, réalisateur,
  année, durée, vu/pas vu.
- [ ] **3.5** Wordmark « M0V13S » : comparaison visuelle des polices
  (JetBrains Mono / Fira Code / Space Mono) — choix validé par l'utilisateur.
- [ ] **3.6** Fin de phase : deps, docs, portabilité, push.

## Phase 4 — Lecture & suivi

- [ ] **4.1** `vlc.service` : spawn VLC portable (fullscreen, port HTTP
  dynamique), polling position, `--start-time` pour la reprise + tests
  (parsing statut mocké).
- [ ] **4.2** `watch_state` : vu automatique (> 90 %), reprise, marquage manuel
  vu/pas vu depuis l'UI + tests.
- [ ] **4.3** Fin de phase : deps, docs, portabilité, push.

## Phase 5 — Intelligence & finitions

- [ ] **5.1** Rangées de suggestions (à reprendre, jamais vus, pas vus depuis
  longtemps, genre favori, ajoutés récemment) + tests SQL.
- [ ] **5.2** Verrou admin : combo touches + mot de passe (scrypt) + définition
  au premier lancement.
- [ ] **5.3** `vlc-updater.service` : vérification/téléchargement en mode admin,
  bascule au redémarrage, version de secours + tests.
- [ ] **5.4** Édition contrôlée dans la vue admin des tables (via services
  métier, réécriture `.nfo` garantie).
- [ ] **5.5** Écran de premier lancement : choix des racines, clé TMDB, mot de
  passe admin.
- [ ] **5.6** Polish UI : animations, focus clavier, états vides, accessibilité.
- [ ] **5.7** Test e2e « smoke » sur le build packagé (lancement, conformité,
  navigation, lecture).
- [ ] **5.8** **Release v1.0** : build final, tag git, GitHub Release, READMEs
  finalisés (guide d'utilisation complet, captures d'écran).
