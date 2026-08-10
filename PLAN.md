# M0V13S — Plan de développement (validé)

> Application desktop Windows, **100 % portable et hors-ligne**, pour organiser
> et regarder une vidéothèque personnelle stockée sur un disque dur (externe),
> avec une interface « façon Netflix ».

**Deux principes fondateurs :**

1. **Standalone intégral** — rien n'est installé sur la machine hôte. On
   branche le disque, on lance l'exe, ça marche — M0V13S comme VLC sont
   embarqués sur le disque, avec ou sans internet.
2. **Les dossiers de contenu sont le maître.** Le programme reflète fidèlement
   ce qui est dans ses dossiers de contenu : les métadonnées voyagent avec les
   fichiers (sidecars `.nfo` + images), la base SQLite n'est qu'un **index
   reconstructible**. On peut partager le programme (ou un dossier de films) :
   posé à côté d'un autre contenu, il s'y adapte — les fiches se reconstruisent
   depuis les sidecars, sans internet et sans questions.

---

## 1. Décisions actées (validées ensemble)

| Sujet | Décision | Note |
|---|---|---|
| Source de vérité | **Les dossiers de contenu** (vidéos + sidecars) | La DB est un index reconstructible ; elle peut être supprimée et régénérée depuis les dossiers. |
| Affichage | **Uniquement ce qui est présent sur le disque ET reconnu** | Fichier disparu → masqué. Fichier non qualifié → masqué (avec notice discrète « X fichiers à qualifier »). Si rien n'est reconnu → scan forcé, pas d'accès au mode classique. |
| Lancement | **Scan rapide de conformité à chaque démarrage** | Simple comparaison listing disque ↔ index (pas de ffprobe, pas d'API, quelques secondes). L'import de contenu ne se fait **que** via le mode « Scanner ». |
| Shell desktop | **Electron** (build portable) | Chromium embarqué → zéro dépendance sur la machine hôte. |
| Frontend | **Angular 22** (signals, standalone) + **hybride Angular Material / Tailwind** | Material là où il excelle : formulaires, dialogues, autocomplete, chips (mode admin, assistant de scan). Tailwind custom pour l'UI cinéma (browse, fiches, carrousels). Layout d'esprit Material. |
| Thèmes | **2 thèmes light / dark, commutables à tout moment** | Un seul interrupteur pilote Material (tokens M3) et Tailwind (`class="dark"`). Choix persisté dans `settings`. Polices et icônes Material bundlées en local (npm) — jamais de CDN, exigence hors-ligne. |
| Polices | **Roboto** (base) + police dédiée pour le wordmark « M0V13S » | Le wordmark exige des chiffres immédiatement différenciés des lettres (zéro barré/pointé, 1 distinct du I) → police de code : shortlist JetBrains Mono / Fira Code / Space Mono, choix final validé visuellement en phase 3. Les deux bundlées en local. |
| i18n | **@jsverse/transloco — FR + EN en v1, extensible** | Traduction à l'exécution depuis des JSON bundlés en local (hors-ligne), changement de langue à chaud comme le thème, choix persisté dans `settings`. Ajouter une langue = un fichier JSON. |
| Backend local | **Process main Electron en TypeScript pur** | Pas de NestJS : le main process est le backend (fs, DB, TMDB, VLC). IPC typé via `contextBridge` (contrat partagé dans `shared/`). |
| Base de données | **SQLite** via `better-sqlite3` + **Drizzle ORM** | Un fichier `data/library.db` à côté de l'exe. Sensation proche de Prisma (schéma TS, typage fort) sans binaires lourds. |
| API métadonnées | **TMDB** (themoviedb.org) | Gratuite ; titres VO + VF natifs, casting, genres, affiches, clés YouTube des trailers. |
| Lecture vidéo | **VLC portable embarqué sur le disque** | Aucune installation sur la machine hôte. Piloté via son interface HTTP locale → suivi de position (vu / reprendre). |
| Mise à jour VLC | **Proposée en mode admin quand on est en ligne** | Vérification de la dernière version portable, téléchargement sur accord, remplacement de `tools\vlc` au prochain démarrage — jamais pendant une lecture. Hors ligne : on reste sur la version embarquée. |
| Mise à jour de l'app | **Copie manuelle d'un nouveau build** | Les libs npm sont compilées dans l'exe au build — il n'y a rien à mettre à jour sur le disque. Remplacer le dossier de l'app ne touche ni `data\` ni les sidecars (séparés par conception). Un self-update façon VLC n'aurait de sens que si le programme est partagé à d'autres utilisateurs (→ « Plus tard »). |
| Dépendances (dev) | **pnpm**, mise à jour à chaque fin de phase | `pnpm outdated` + `pnpm up -i` + `pnpm audit` en fin de phase. Trois familles jamais automatiques : Angular (via `ng update`), Electron et better-sqlite3/Drizzle (rebuild natif + retest de portabilité obligatoires). |
| Vue admin des données | **ag-grid Community** | Tables de la DB en mode admin : tri, filtre, recherche, virtualisation. Lecture seule dès la phase 1 (outil de contrôle) ; édition en phase 5, toujours via les services métier (réécriture `.nfo` garantie, jamais de SQL direct). |
| Open source | **MIT, publié sur GitHub** | Binaires tiers (VLC, ffprobe) hors repo : script `prepare-tools` au packaging. Aucun secret commité (clé TMDB dans `settings`). README EN + FR = guide d'utilisation, attribution TMDB obligatoire, fichier LICENSE. |
| Tests | **Stratégie renforcée** | Chaque service du main process testé (Vitest), stores UI, migrations sur DB temporaire, complétude i18n ; e2e « smoke » sur le build packagé en phase 5. Un bug corrigé = un test de non-régression. |
| Métadonnées fichiers | **Sidecars à côté de chaque vidéo** : `.nfo` (standard Kodi/Jellyfin) + `-poster.jpg` / `-fanart.jpg` | Chaque dossier de contenu est autonome et partageable : vidéo + fiche + images. On ne modifie jamais les fichiers vidéo. `data\` ne garde qu'un cache de miniatures régénérable. |
| État de visionnage | **Personnel, DB locale uniquement** | Vu / position de reprise ne sont pas exportés dans les `.nfo` : partager ses dossiers ne partage pas son historique. |
| Séries | **Schéma unifié films + séries dès maintenant, UI films seule en v1** | Schéma validé ensemble (§ 5) : table `media` unifiée, `seasons` en table, `watch_state` par épisode, `video_files` 1-N avec `partNumber`. |
| Analyse fichiers | **ffprobe embarqué** | Durée, codecs, résolution extraits au scan. |
| Mode admin | Mot de passe (hash local), dialogue à l'accès aux fonctions admin | Obfuscation suffisante pour un usage privé, pas de gestion d'utilisateurs. Pas de combo touches (décision utilisateur, phase 5) : la navigation suffit à déclencher l'invite. |

---

## 2. Les quatre contraintes qui dictent l'architecture

1. **Fidélité au contenu** — l'app ne montre que ce qui existe réellement sur
   le disque et a été qualifié. Les métadonnées vivent dans les dossiers
   (sidecars), pas seulement dans la base : un contenu partagé arrive complet
   et se réimporte tout seul via le scan, hors ligne.
2. **Codecs hétérogènes** — Chromium ne lit ni l'audio AC3/DTS ni (souvent) le
   HEVC. D'où VLC embarqué : il lit un maximum de formats existants, et son
   interface HTTP nous donne la position de lecture en temps réel. Maintenu à
   jour via le mode admin quand on est connecté (§ 6.7).
3. **Lettre de lecteur variable** — le disque sera `D:` ici, `E:` là. La DB ne
   stocke **que des chemins relatifs** (résolus au démarrage à partir de
   l'emplacement de l'exe). Aucun chemin absolu, nulle part.
4. **Hors-ligne complet** — tout ce qui vient de TMDB (infos, images) est
   téléchargé au moment du scan (fait en ligne) et stocké **dans les dossiers
   de contenu**. En mode lecture, zéro requête réseau. Seul le trailer
   (YouTube) reste online-only, avec mention « trailer non disponible hors
   ligne » sinon. Même exigence côté UI : polices et icônes embarquées, aucun CDN.

---

## 3. Arborescence sur le disque externe (produit final)

```
X:\                            ← n'importe quelle lettre de lecteur
└── M0V13S\
    ├── M0V13S.exe             ← app Electron portable (+ resources)
    ├── data\
    │   ├── library.db         ← SQLite (index reconstructible)
    │   └── thumbs\            ← cache de miniatures redimensionnées (régénérable)
    ├── tools\
    │   ├── vlc\               ← VLC portable complet (vlc.exe + plugins)
    │   └── ffprobe.exe
    └── ...
X:\Films\                      ← les vidéos, où on veut sur le disque
    └── Prometheus (2012)\
        ├── Prometheus.2012.1080p.mkv
        ├── Prometheus.2012.1080p.nfo          ← fiche complète (sidecar)
        ├── Prometheus.2012.1080p-poster.jpg   ← affiche (sidecar)
        └── Prometheus.2012.1080p-fanart.jpg   ← backdrop (sidecar)
```

Chaque dossier de film est **autonome** : on peut le copier ailleurs, il
emporte sa fiche et ses images. Les dossiers à scanner (« racines de
bibliothèque ») sont configurables en mode admin et stockés en relatif par
rapport à la racine du lecteur.

---

## 4. Arborescence du code source

```
M0V13S\                        ← ce repo
├── package.json               ← scripts racine (dev, build, package)
├── electron\                  ← main process (backend)
│   ├── main.ts                ← fenêtre, cycle de vie, résolution des chemins
│   ├── preload.ts             ← contextBridge → window.api typé
│   ├── ipc\                   ← handlers ipcMain.handle par domaine
│   ├── services\
│   │   ├── paths.service.ts   ← résolution exe/data/racine lecteur (LE point sensible)
│   │   ├── conformity.service.ts ← scan rapide de conformité au lancement
│   │   ├── scanner.service.ts ← scan complet : nouveaux/manquants/renommés, import .nfo
│   │   ├── ffprobe.service.ts ← extraction technique (durée, codecs, résolution)
│   │   ├── filename.service.ts← devine titre + année depuis le nom de fichier
│   │   ├── tmdb.service.ts    ← recherche, détails, téléchargement images
│   │   ├── vlc.service.ts     ← spawn VLC portable + polling HTTP position
│   │   ├── vlc-updater.service.ts ← vérif/téléchargement dernière version portable
│   │   ├── nfo.service.ts     ← lecture/écriture des sidecars .nfo (XML Kodi)
│   │   ├── thumbs.service.ts  ← cache de miniatures (génération, invalidation)
│   │   └── settings.service.ts← clé TMDB, mot de passe admin, racines, thème, préfs
│   └── db\
│       ├── schema.ts          ← schéma Drizzle
│       ├── client.ts          ← ouverture better-sqlite3
│       └── migrations\        ← migrations Drizzle versionnées
├── shared\                    ← types partagés main ↔ renderer (DTO, contrat IPC)
├── ui\                        ← workspace Angular 22
│   └── src\app\
│       ├── core\              ← ApiService (wrapper window.api), stores signaux, ThemeService
│       ├── features\
│       │   ├── home\          ← écran d'accueil : « Lancer » / « Scanner » (+ scan forcé)
│       │   ├── browse\        ← grille Netflix, rangées, filtres/tris
│       │   ├── detail\        ← fiche film (affiche, casting, trailer, lire)
│       │   ├── scan\          ← assistant de scan (import .nfo + wizard fichier par fichier)
│       │   └── admin\         ← édition fiche, réglages, MAJ VLC, déverrouillage
│       └── ...
└── tools\                     ← binaires copiés dans le package final (vlc, ffprobe)
```

---

## 5. Schéma de données (validé)

Table `media` **unifiée** films + séries : jonctions genres/tags/people définies
une seule fois, browse et filtres mélangent les deux types en une requête,
`watch_state` et suggestions partagés.

```
media ─── la fiche, commune films & séries
│  id, type ('movie' | 'series')
│  titleVo, titleVf, year, overview
│  tmdbId, posterPath, backdropPath, trailerYoutubeKey
│  personalRating, createdAt, updatedAt
│
├──< media_genres >──── genres (name, tmdbId)
├──< media_tags >────── tags   (libres : "alien", "huis clos", …)
├──< media_people >──── people (name, tmdbId)
│        role: 'director' | 'writer' | 'actor'  + character + sortOrder
│
├──< seasons            (si type = series)
│      number, title, overview, posterPath
│      └──< episodes
│             number, title, overview, stillPath, tmdbId
│             └──< video_files
│
└──< video_files        (si type = movie — 1-N par film)
       relPath (relatif racine lecteur), sizeBytes, mtime
       durationSec, videoCodec, audioCodec, width, height
       partNumber ('CD1'/'CD2'…), status ('ok' | 'missing'), scannedAt

watch_state ─── pointe vers un film OU un épisode (contrainte CHECK)
       watchCount, lastWatchedAt, resumePositionSec, completed
       (personnel : jamais exporté dans les .nfo)

settings ─── key / value (clé TMDB, hash admin, racines, thème, préférences)
```

Choix de conception validés :
- **`video_files` en 1-N par film** : couvre les rips en plusieurs parties
  (`partNumber` CD1/CD2) et les doubles versions (1080p + 4K du même film).
- **`watch_state` au niveau épisode** pour les séries : permettra plus tard
  « reprendre à l'épisode suivant ».
- **`seasons` en table** (pas une simple colonne) : TMDB fournit affiche et
  synopsis par saison, on peut les stocker.
- Lien polymorphe (`mediaId` OU `episodeId`) sécurisé par contrainte CHECK.
- Les chemins d'images (`posterPath`, `backdropPath`) pointent vers les
  **sidecars dans les dossiers de contenu**, en relatif.

En v1, seul le chemin `media(type=movie) → video_files` est exercé ; les tables
séries existent, migrées et prêtes, mais sans UI ni scanner dédiés.

---

## 6. Les flux clés

### 6.1 Lancement : scan rapide de conformité (toujours)

À chaque démarrage, avant d'afficher quoi que ce soit :

1. Listing des racines de bibliothèque (noms + tailles uniquement — pas de
   ffprobe, pas d'API : quelques secondes même sur HDD).
2. Confrontation à l'index :
   - fichier indexé **présent** → affiché ;
   - fichier indexé **absent** → `status = missing`, **masqué** du mode classique ;
   - fichier présent **non indexé** (nouveau, ou dossier partagé) → **masqué**,
     compté dans une notice discrète « X fichiers à qualifier — lancer un scan ».
3. **Règle d'affichage absolue : n'apparaît que ce qui est sur le disque ET reconnu.**
4. Si l'index ne reconnaît **aucun** fichier présent (premier lancement,
   programme copié sur un nouveau contenu, DB supprimée…) → le mode « Scanner »
   est **forcé** : pas d'accès au mode classique tant que rien n'est qualifié.

Aucun import n'est fait à ce stade : l'écriture dans l'index passe
exclusivement par le mode « Scanner ».

### 6.2 Mode « Scanner » (import et qualification)

1. Scan complet des racines ; confrontation à l'index (nouveaux / manquants /
   renommés — un renommage probable, même taille + même durée, propose un
   re-lien au lieu de recréer la fiche ; un manquant propose la suppression de
   la fiche **sur confirmation**).
2. **Import silencieux des sidecars** : tout nouveau fichier accompagné d'un
   `.nfo` (+ images) est importé automatiquement, sans question, hors ligne —
   c'est ce qui rend le partage fluide : un dossier reçu complet se réimporte
   en masse en quelques secondes.
3. **Assistant de qualification** pour les fichiers sans `.nfo`, en 3 temps :
   a. **ffprobe** → durée, codecs, résolution (préremplissage technique) ;
   b. **parsing du nom de fichier** (`Prometheus.2012.1080p.BluRay.x264.mkv` →
      « Prometheus », 2012) → **recherche TMDB** (fr-FR) → choix du bon
      résultat dans une liste (vignettes) ; recherche manuelle possible ;
   c. **formulaire prérempli** (Material) : titre VO, titre VF, année,
      réalisateur(s), scénariste(s), acteurs, genres, synopsis, tags custom —
      tout modifiable. À la validation : écriture DB + **écriture des sidecars**
      (`.nfo` + poster + fanart téléchargés dans le dossier du film) +
      miniatures en cache.
4. Fin du scan → redirection vers le mode classique.
5. Scan hors-ligne possible : les fichiers avec `.nfo` s'importent normalement ;
   pour les autres, les champs restent manuels, bouton « réessayer
   l'enrichissement TMDB » disponible plus tard sur chaque fiche.

L'édition d'une fiche en mode admin réécrit le `.nfo` : les sidecars restent
toujours le reflet exact de l'index.

### 6.3 Lecture (VLC)

1. Clic « Lire » → spawn de `tools\vlc\vlc.exe` :
   `--fullscreen --play-and-exit --no-video-title-show --extraintf http`
   (interface HTTP sur `127.0.0.1`, port choisi dynamiquement, mot de passe local)
   + `--start-time=<resumePositionSec>` si reprise.
2. Pendant la lecture, le main process interroge `…/requests/status.json` toutes
   les ~5 s → position courante sauvegardée.
3. À la fermeture de VLC : position finale → si > 90 % de la durée, marqué
   **vu** (watchCount+1, lastWatchedAt) ; sinon **à reprendre**.

### 6.4 Suggestions (mode classique, écran d'accueil)

Rangées calculées en SQL, dans l'ordre :
« À reprendre » • « Jamais vus » • « Pas vus depuis longtemps » •
« Parce que vous aimez *{genre le plus regardé}* » • « Ajoutés récemment ».

### 6.5 Thèmes light / dark

- Interrupteur accessible en permanence (header), effet immédiat, choix
  persisté dans `settings`.
- Un seul signal `theme` pilote les deux systèmes : tokens M3 d'Angular
  Material (`color-scheme`) **et** la variante `dark` de Tailwind
  (classe sur `<html>`) — pas deux mécanismes à synchroniser à la main.
- Charte définie dans les deux modes dès la phase 3 (le look « cinéma » sombre
  reste le thème dark ; le light en est la déclinaison claire).

### 6.6 Internationalisation (i18n)

- **@jsverse/transloco** : traductions à l'exécution depuis des JSON bundlés
  (`assets/i18n/fr.json`, `en.json`) — changement de langue à chaud, sans
  rechargement, à côté de l'interrupteur de thème. Choix persisté dans
  `settings` ; premier lancement : langue du système si disponible (fr/en),
  sinon anglais.
- Ajouter une langue = un fichier JSON + une entrée de config (nouveau build).
- **Complétude vérifiée automatiquement** : un test compare les jeux de clés
  de toutes les langues — clé manquante ou orpheline dans l'une d'elles =
  échec des tests. Conçu pour accueillir les langues futures sans trou de
  traduction.
- **Distinction importante** : la langue de l'**UI** (Transloco) est
  indépendante de la langue des **fiches**. Les données TMDB restent
  récupérées en fr-FR (titre VF, synopsis) — une UI en anglais affiche donc
  des synopsis en français en v1. Le stockage multilingue des fiches est noté
  en « Plus tard ».

### 6.7 Mise à jour de VLC (mode admin, en ligne uniquement)

1. À l'entrée du mode admin, si une connexion est disponible : vérification de
   la dernière version portable win64 publiée par VideoLAN.
2. Si plus récente que `tools\vlc` : proposition à l'utilisateur (version,
   taille). Rien ne se télécharge sans accord.
3. Sur accord : téléchargement dans `tools\vlc.new`, vérification d'intégrité,
   **bascule au prochain démarrage de l'app** (jamais pendant une lecture).
   L'ancienne version est conservée jusqu'à la première lecture réussie.

### 6.8 Mode admin

Accès à une fonction admin (Scanner, vue données…) → dialogue de mot de
passe → comparaison au hash (scrypt, module `crypto` de Node) stocké dans
`settings`. Pas de combo touches (décision utilisateur, phase 5) : la
navigation déclenche l'invite, un cadenas dans le header re-verrouille.
Déverrouille : édition des fiches, lancement du scan, réglages, MAJ VLC,
vue données. (Obfuscation assumée, pas de la vraie sécurité — usage privé.)

**Vue données** : les tables de la DB exposées dans des grilles **ag-grid
Community** (tri, filtre, recherche, virtualisation pour les grosses tables).
Lecture seule d'abord — c'est un outil de contrôle et de diagnostic. L'édition
(phase 5) passe par les mêmes services métier que les formulaires : jamais
d'écriture SQL directe, pour garantir la réécriture des `.nfo` et le respect
des invariants.

---

## 7. Phases de développement

Chaque phase livre quelque chose de testable. La portabilité — le risque n° 1 —
est dérisquée dès la phase 0.

### Phase 0 — Squelette portable ✅ critère de sortie : l'exe tourne depuis une clé USB sur une autre machine, hors ligne
- Init repo git + pnpm, workspace Angular 22 + Tailwind + Angular Material (thème
  M3 light/dark de base, polices/icônes locales) + Transloco (squelette fr/en),
  process Electron, dev avec rechargement.
- IPC typé de bout en bout (contrat dans `shared/`, `preload` + `window.api`).
- `better-sqlite3` + Drizzle branchés (rebuild natif Electron), DB créée à côté de l'exe.
- `paths.service` : résolution exe → `data\` → racine lecteur, en dev comme en prod.
- README (EN + FR), LICENSE MIT, `.gitignore` (binaires `tools\` hors repo) +
  script `prepare-tools` (téléchargement VLC portable + ffprobe).
- Socle de tests (Vitest) branché, test de complétude i18n inclus.
- Packaging portable (electron-builder) + **test réel sur une seconde machine**.

### Phase 1 — Bibliothèque locale & conformité
- Schéma Drizzle complet (§ 5) + migrations.
- Scan de conformité au lancement (§ 6.1), règle « présent ET reconnu », scan forcé si index vide.
- Scanner complet (nouveaux / manquants / renommés) + ffprobe + parsing des noms de fichiers.
- Formulaire de fiche 100 % manuel (sans API) ; liste brute des films dans l'UI.
- Vue admin des tables DB en lecture seule (ag-grid) — outil de contrôle du scanner.

### Phase 2 — Sidecars & enrichissement TMDB
- Écriture/lecture des `.nfo` + import silencieux en masse (§ 6.2.2) — le
  scénario « partage » devient fonctionnel dès cette phase.
- Recherche TMDB + sélection du bon film, préremplissage du formulaire.
- Téléchargement des poster/fanart **en sidecars** + cache de miniatures.
- Gestion du mode hors-ligne au scan.

### Phase 3 — UI « Netflix »
- Écran d'accueil 2 options (« Lancer » / « Scanner »), scan forcé si rien de reconnu.
- Grille de films, rangées horizontales, fiche détail (affiche, casting, genres,
  tags, trailer YouTube si en ligne).
- Filtres et tris combinables : genre, tag, acteur, réalisateur, année, durée,
  vu/pas vu, ordre alphabétique/année/ajout.
- Thèmes light/dark finalisés dans les deux mondes (Material + Tailwind),
  interrupteur permanent.

### Phase 4 — Lecture & suivi
- Intégration VLC portable (spawn + HTTP status).
- Reprise de lecture, marquage vu/pas vu (manuel et automatique).

### Phase 5 — Intelligence & finitions
- Rangées de suggestions (§ 6.4).
- Verrou admin (mot de passe, dialogue à l'accès).
- Mise à jour de VLC depuis le mode admin (§ 6.7).
- Édition contrôlée dans la vue admin des tables (via les services métier).
- Test e2e « smoke » sur le build packagé (lancement, conformité, navigation, lecture).
- Polish UI (animations, focus clavier, états vides), écran de premier lancement
  (choix des racines, clé TMDB).
- La release ne clôt PLUS cette phase : elle arrive en fin de phase 6
  (décision utilisateur, 2026-08-10).

### Phase 6 — Recette générale & release v1.0
Vérification systématique de TOUT ce qui existe avant la vraie release
(décision utilisateur) : une checklist exhaustive (`docs/RECETTE.md`),
générée depuis l'inventaire réel du code (écrans, services, canaux IPC,
réglages, i18n, thèmes), que l'utilisateur déroule pour identifier
micro-changements et oublis.
- Recette « parcours & vues » : chaque écran dans les deux thèmes et les
  deux langues.
- Recette « systèmes » : conformité, sidecars/partage, hors-ligne
  intégral, lecture/reprise/vu, MAJ VLC, portabilité réelle (machine B).
- Corrections par lots (tests de non-régression), checklist re-cochée.
- **Release v1.0** : build final, tag git, GitHub Release, READMEs
  finalisés (guide complet, captures d'écran).

### Plus tard (hors périmètre v1)
- UI séries (détection `S01E02`, regroupement saisons, épisode suivant) —
  le schéma est déjà prêt.
- Self-update de l'app depuis le mode admin (à la façon VLC, via un dépôt en
  ligne type GitHub Releases) — pertinent seulement si le programme est un jour
  partagé à d'autres utilisateurs que toi.
- Fiches multilingues : stocker titres/synopsis TMDB en plusieurs langues et
  afficher selon la langue de l'UI ; éventuels packs de langue déposables dans
  `data\i18n\` sans rebuild.
- Import/export de la DB, statistiques de visionnage, multi-profils éventuels.

---

## 8. Risques identifiés & parades

| Risque | Parade |
|---|---|
| Module natif `better-sqlite3` vs version d'Electron | `@electron/rebuild` intégré au script d'install ; verrouiller les versions. |
| Chemins absolus qui se glissent dans la DB | Interdits par construction : tout passe par `paths.service` ; test dédié. |
| Scan de conformité lent sur très grosse bibliothèque HDD | Listing seul (pas de lecture des fichiers), exécuté pendant l'écran d'accueil ; index par dossier si besoin. |
| Dossier partagé **sans** `.nfo` | Cas assumé : les fichiers passent par l'assistant de qualification comme n'importe quel nouveau fichier. |
| `.nfo` corrompu ou d'un autre outil (variantes Kodi) | Parseur tolérant, champs inconnus ignorés, fichier régénéré à la première édition. |
| VLC portable : port HTTP occupé sur la machine hôte | Port choisi dynamiquement parmi une plage, passé à VLC au spawn. |
| MAJ VLC : téléchargement corrompu ou format VideoLAN changé | Vérification d'intégrité, bascule seulement après validation, ancienne version conservée en secours. |
| Styles Material vs reset Tailwind (preflight) | Cohabitation cadrée dès la phase 0 (ordre des couches CSS, scope du preflight) — réglé une fois, testé sur un composant de chaque monde. |
| Nom de fichier imparfait → mauvais match TMDB | L'utilisateur choisit toujours dans une liste de résultats ; recherche manuelle possible. |
| Clé API TMDB requise | Créée une fois (gratuite), stockée dans `settings` ; l'app fonctionne sans (saisie manuelle). |
| Disque lent (HDD externe) | Miniatures en cache local redimensionnées ; scan incrémental (mtime/taille). |

---

## 9. Méthode de travail

- **Git dès le départ** ; commits par fonctionnalité, messages conventionnels.
- **pnpm** comme gestionnaire de paquets, lockfile commité. Mise à jour des
  dépendances **à chaque fin de phase** (`pnpm outdated`, `pnpm up -i`,
  `pnpm audit`) plutôt qu'au fil de l'eau. Angular toujours via `ng update` ;
  toute montée d'Electron ou de better-sqlite3/Drizzle impose un rebuild natif
  et un retest de portabilité avant d'être actée.
- **i18n dès la première ligne d'UI** : aucune chaîne en dur, tout passe par
  Transloco (fr + en alimentés au fil du développement) — pas de phase de
  rattrapage de traduction en fin de projet. Complétude des langues vérifiée
  par test automatique (§ 6.6).
- Dev : `ng serve` + Electron pointant sur le serveur de dev (hot reload) ;
  prod : Angular buildé chargé en `file://`.
- **Tests renforcés** (Vitest) : chaque service du main process (parsing des
  noms, conformité présent/reconnu/manquant, scanner nouveau/manquant/renommé,
  résolution de chemins, lecture/écriture `.nfo`, mapping TMDB mocké, parsing
  du statut VLC), stores signaux de l'UI, migrations sur DB temporaire,
  complétude i18n. Un bug corrigé = un test de non-régression. E2e « smoke »
  sur le build packagé en phase 5.
- **Documentation vivante** : toute adaptation (décision, commande, structure,
  fonctionnalité) met à jour `CLAUDE.md`, `PLAN.md`, `README.md` et
  `README.fr.md` dans la foulée.
- **Code toujours commenté** : TSDoc sur services/méthodes/types du contrat
  IPC, commentaires sur les logiques non triviales, et mise à jour des
  commentaires à chaque modification du code — pour rester compréhensible par
  un humain qui revient sur le projet plus tard.
- **Décisions non triviales** : demander à l'utilisateur (options +
  recommandation) ; sans réponse claire, décider dans l'intérêt du bon
  développement de l'app et documenter.
- **Repo public** : jamais de binaires tiers ni de secrets commités — la clé
  TMDB est saisie par l'utilisateur et vit dans `settings` (`data\`, hors repo).
- Fin de chaque phase : test de portabilité (copie sur disque externe, machine B).
