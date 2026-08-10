# CLAUDE.md — M0V13S

Bible du projet. Ne jamais dévier de ce document sans accord explicite de
l'utilisateur. Toute nouvelle décision structurante validée ensemble doit être
reportée ici ET dans `PLAN.md` (le plan détaillé : schéma § 5, flux § 6,
phases § 7). Les deux fichiers doivent toujours rester cohérents.

## Le projet en une phrase

Application desktop Windows **portable et 100 % hors-ligne** de gestion et
lecture d'une vidéothèque locale (disque dur externe), interface « façon
Netflix » privée, avec un mode admin de scan/qualification des fichiers.
Projet **open source (MIT)**, publié sur GitHub.

## Les deux principes fondateurs — intouchables

1. **Standalone intégral** : rien n'est installé sur la machine hôte. M0V13S,
   VLC et ffprobe sont embarqués sur le disque. Tout fonctionne sans internet
   (le réseau n'apporte que des bonus : enrichissement TMDB, trailers, MAJ VLC).
2. **Les dossiers de contenu sont le maître** : la DB SQLite n'est qu'un index
   reconstructible. Les métadonnées voyagent avec les fichiers (sidecars
   `.nfo` + `-poster.jpg` + `-fanart.jpg`, convention Kodi). Le programme
   partagé ou posé sur un nouveau contenu s'y adapte via le scan.

## Stack (décidé ensemble — ne pas remettre en cause)

| Brique | Choix |
|---|---|
| Shell | Electron, build portable (electron-builder) |
| Frontend | Angular 22 — signals, standalone, zoneless si stable |
| UI kit | Hybride : Angular Material (formulaires, dialogues, chips, autocomplete — admin/scan) + Tailwind custom (UI cinéma : browse, fiches, carrousels) |
| Thèmes | Light + dark, commutables à chaud, un seul signal pilote Material (tokens M3) et Tailwind (`class="dark"`). Accent « brand » BI-THÈME (choix utilisateur) : sarcelle en clair, ambre en sombre, via `light-dark()` (tokens `--color-brand`/`--color-on-brand`) ; Material aligné (primaire cyan, tertiaire orange) |
| Polices | Roboto (base, bundlée). Wordmark « M0V13S » : **Space Mono 700** (choix utilisateur phase 3 — zéro barré, 1 distinct du I), bundlée via @fontsource, token Tailwind `--font-wordmark` |
| i18n | @jsverse/transloco, fr + en, extensible, changement à chaud |
| Vue données admin | ag-grid Community : tables de la DB en mode admin (tri, filtre, virtualisation) |
| Backend | Main process Electron en TS pur (PAS de NestJS), IPC typé via contextBridge |
| DB | SQLite : better-sqlite3 + Drizzle ORM, migrations versionnées |
| API films | TMDB (fr-FR), images téléchargées en sidecars au scan |
| Lecture | VLC portable embarqué (`tools\vlc`), spawn + interface HTTP locale pour suivre la position |
| Analyse | ffprobe embarqué |
| Paquets | pnpm, lockfile commité |

## Décisions clés (résumé — détail dans PLAN.md)

- **Règle d'affichage absolue** : n'apparaît que ce qui est présent sur le
  disque ET reconnu par l'index. Scan rapide de conformité à chaque lancement
  (listing seul, aucun import). Si rien n'est reconnu → mode Scanner forcé.
- **Les imports/écritures d'index passent exclusivement par le mode Scanner** :
  import silencieux des fichiers avec `.nfo`, assistant de qualification
  (ffprobe → parsing nom → TMDB → formulaire) pour les autres.
- **Chemins relatifs uniquement** (relatifs à la racine du lecteur, résolus via
  `paths.service`). Un chemin absolu en DB est un bug.
- **Toute édition de fiche réécrit son `.nfo`** : sidecars = reflet exact de
  l'index, en permanence.
- **`watch_state` est personnel** : DB locale uniquement, jamais exporté dans
  les `.nfo`.
- **Schéma unifié** films + séries (`media` + `seasons`/`episodes`,
  `video_files` 1-N avec `partNumber`, jonctions genres/tags/people uniques).
  V1 : UI films seulement, tables séries prêtes.
- Fichier disparu → `missing` + masqué ; suppression de fiche **sur
  confirmation uniquement**. Renommage probable (taille + durée identiques) →
  proposer un re-lien.
- **MAJ VLC** : proposée en mode admin quand en ligne, bascule au prochain
  démarrage, ancienne version conservée en secours. **MAJ de l'app** : copie
  manuelle d'un nouveau build (data\ et sidecars intacts par conception).
- **Mode admin** : mot de passe hashé (scrypt via `crypto`), demandé par un
  dialogue à l'accès aux fonctions admin (pas de combo touches — décision
  utilisateur phase 5), obfuscation assumée.
- Aucune ressource distante dans l'UI : polices, icônes, images — tout est
  bundlé (exigence hors-ligne). Seul le trailer YouTube est online-only.
- **Vue admin des tables DB** (ag-grid Community) : lecture/tri/filtre sur
  toutes les tables dès la phase 1 (outil de contrôle) ; toute édition (phase 5)
  passe par les services métier — **jamais d'écriture SQL directe** qui
  contournerait la réécriture des `.nfo`.
- **Open source (MIT)** : les binaires tiers (VLC, ffprobe) ne sont **pas**
  dans le repo (script `prepare-tools` au packaging) ; aucun secret commité
  (la clé TMDB vit dans `settings`, côté `data\`) ; attribution TMDB
  obligatoire dans le README et l'app.

## Architecture du code

```
electron\   main process : ipc\ (handlers), services\ (paths, conformity,
            scanner, ffprobe, filename, tmdb, vlc, vlc-updater, nfo, thumbs,
            settings), db\ (schema Drizzle, client, migrations)
shared\     contrat IPC + DTO partagés main ↔ renderer (source de vérité des types)
ui\         Angular 22 : core\ (ApiService, stores signaux, ThemeService),
            features\ (home, browse, detail, scan, admin)
tools\      binaires embarqués au packaging (vlc, ffprobe)
```

- Le renderer **ne touche jamais** fs, DB ou réseau : tout passe par
  `window.api` (préload, contextIsolation activé, nodeIntegration désactivé).
- Toute nouvelle API IPC : d'abord le type dans `shared\`, puis le handler,
  puis le client.

## Bonnes pratiques — à respecter systématiquement

### Générales
- Toujours appliquer les bonnes pratiques **actuelles** du code et des libs :
  vérifier la doc à jour (Angular 22, Tailwind v4, Drizzle, Electron) plutôt
  que reproduire de vieilles habitudes.
- TypeScript strict partout ; pas de `any` non justifié ; les types du contrat
  IPC vivent dans `shared\` et nulle part ailleurs.
- Petites unités testables, noms explicites.
- **Tout est toujours commenté** (exigence utilisateur) : le code doit être
  facilement compréhensible par un humain qui y revient dans le futur. TSDoc
  sur chaque service, méthode publique et type du contrat IPC (rôle, entrées,
  sorties, effets) ; commentaires dans le corps pour le pourquoi et les étapes
  des logiques non triviales. Les commentaires sont **maintenus** : toute
  modification de code met à jour les commentaires concernés — un commentaire
  périmé est un bug de documentation.
- **Tests solides — priorité utilisateur** : chaque service du main process a
  ses tests unitaires (parsing des noms, conformité, scanner, chemins, `.nfo`,
  mapping TMDB mocké, statut VLC) ; stores signaux de l'UI testés ; migrations
  testées sur DB temporaire ; complétude i18n testée. Un bug corrigé = un test
  de non-régression. E2e « smoke » sur le build packagé (phase 5).
- Commits conventionnels par fonctionnalité.
- MAJ des dépendances en fin de phase (`pnpm outdated`, `pnpm up -i`,
  `pnpm audit`) ; Angular via `ng update` ; Electron / better-sqlite3 / Drizzle
  avec rebuild natif + retest de portabilité obligatoires.

### Angular
- Signals d'abord : `signal`, `computed`, `effect`, `input()`/`output()`,
  stores à base de signaux. RxJS seulement quand un flux le justifie vraiment.
- Composants standalone, control flow moderne (`@if`, `@for`), `inject()`
  plutôt que l'injection par constructeur, `ChangeDetectionStrategy.OnPush`.
- **Imports au grain fin** : importer le composant/directive précis
  (`MatIcon`, `MatButton`, `TranslocoDirective`…), jamais un module entier
  (`MatIconModule`…) quand seul un élément est utilisé.
- **Jamais d'appel de méthode directement dans un template** : précalculer via
  `computed()` (ou pipe pur si pertinent).
- **Transloco : directive structurelle** `*transloco="let t"` → `t('clé')`,
  **pas** le pipe `'clé' | transloco`. Aucune chaîne en dur dans les
  templates ; fr + en alimentés au fil du dev ; clés organisées par feature.
- **Complétude des traductions vérifiée automatiquement** : un test compare
  les jeux de clés de tous les `assets/i18n/*.json` — toute clé manquante ou
  orpheline dans une langue fait échouer les tests (pensé pour accueillir des
  langues futures).
- Pas de logique métier dans les composants : services + stores.

### Styles
- **Tailwind plutôt que des fichiers .css** : pas de styles component sauf
  nécessité réelle (ex. override ciblé de Material impossible autrement).
- **Material autant que possible** (formulaires, dialogues, chips,
  autocomplete, menus…) ; en sortir est autorisé pour les demandes
  spécifiques — typiquement toute l'UI cinéma (browse, cartes, carrousels).
- Tout style doit fonctionner **dans les deux thèmes** light/dark : jamais de
  couleur en dur, toujours les tokens M3 / variables de thème / classes `dark:`.
- Respecter l'esprit de layout Material Design dans toute l'app.

### Electron / backend
- Opérations longues (scan, ffprobe, téléchargements) : asynchrones,
  progression remontée à l'UI, annulables — ne jamais bloquer l'interface.
- Tout changement de schéma DB passe par une migration Drizzle versionnée.
- Écritures atomiques pour les fichiers critiques (`.nfo`, DB) : écrire dans un
  temporaire puis renommer.
- Aucune télémétrie, aucun appel réseau non listé (TMDB, images TMDB,
  videolan.org, YouTube pour le trailer).

## Méthode de collaboration

- **Décision non triviale → demander d'abord** : poser la question à
  l'utilisateur avec des options et une recommandation, plutôt que trancher
  seul. S'il ne sait pas, ou en l'absence de réponse claire : décider
  soi-même en tenant compte du contexte et du bon développement de l'app,
  puis documenter la décision.
- **Documentation vivante** : toute adaptation (décision, commande, structure,
  fonctionnalité) met à jour `CLAUDE.md`, `PLAN.md` et `README.md`
  (+ `README.fr.md`) dans la foulée — la doc n'est jamais en retard sur le code.
- **Confidentialité de l'auteur** : ne jamais écrire le nom réel, l'email ou
  tout identifiant personnel de l'utilisateur dans le code, les docs ou les
  commentaires. Si une mention d'auteur est vraiment nécessaire, utiliser le
  pseudonyme **S13N**. Les credentials (tokens, mots de passe) ne transitent
  jamais par Claude : l'authentification GitHub est gérée par `gh` / le
  gestionnaire d'identifiants Windows.

## Commandes

Prérequis : Node ≥ 22.22.3 (`nvm use 22.23.2`), pnpm 10.

| Commande | Rôle |
|---|---|
| `pnpm dev` | Dev complet : ng serve + esbuild watch (main/preload) + Electron sur localhost:4200 |
| `pnpm build` | Build prod : UI Angular + bundles Electron |
| `pnpm package` | Build + packaging portable → `release\win-unpacked` (dossier à copier sur le disque) |
| `pnpm test` | Tests backend + transverses (Vitest) — inclut la complétude i18n |
| `pnpm test:ui` | Tests UI Angular (Vitest via ng test) |
| `pnpm test:all` | Les deux suites |
| `pnpm typecheck` | Typecheck strict du main process (tsc) |
| `pnpm db:generate` | Génère une migration Drizzle après changement de `electron\db\schema.ts` |
| `pnpm prepare-tools` | Télécharge ffprobe + VLC portable dans `tools\` (`--only=ffprobe` ou `--only=vlc`) |

Pièges connus : tester un exe Electron depuis un terminal VS Code exige de
retirer `ELECTRON_RUN_AS_NODE` (hérité de l'hôte d'extension — sinon l'exe
quitte immédiatement en mode Node pur). better-sqlite3 v13 = N-API prebuilds,
ne JAMAIS l'ajouter à `onlyBuiltDependencies` (le node-gyp auto échouerait).
ag-grid exige une HAUTEUR EXPLICITE sur son élément (`h-100`…) — un simple
`min-height` donne une grille invisible. En dev, tout est en IPv4 explicite
(127.0.0.1) : ne pas réintroduire `localhost` (résolution IPv6 selon machine).

## État d'avancement — à mettre à jour à chaque étape franchie

Détail étape par étape dans `TODO.md` (doc vivante, une étape validée par
l'utilisateur à la fois avant exécution, cochée une fois livrée).
**Reprise de session : lire `docs/REPRISE.md` en premier** (état exact,
actions en attente, pièges d'environnement) — mis à jour en fin de session.

- [x] Phase 0 — Squelette portable (critère validé : exe depuis disque externe sur machine B, hors ligne)
- [x] Phase 1 — Bibliothèque locale & conformité (validée par l'utilisateur : scan, qualification, fiche, vue admin)
- [x] Phase 2 — Sidecars & enrichissement TMDB (validée par l'utilisateur : langues configurables, sidecars, regroupement, édition manuelle, posters)
- [x] Phase 3 — UI « Netflix » (validée par l'utilisateur : charte bi-thème sarcelle/ambre, rangées + miniatures, fiche cinéma, filtres, wordmark Space Mono, langues des pistes)
- [x] Phase 4 — Lecture VLC & suivi (validée par l'utilisateur : lecture, reprise, vu auto/manuel, tools embarqués au packaging)
- [ ] Phase 5 — Intelligence & finitions (en cours — la release est déplacée en fin de phase 6)
- [ ] Phase 6 — Recette générale & release v1.0 (checklist exhaustive `docs/RECETTE.md` déroulée par l'utilisateur, corrections par lots, puis release)
