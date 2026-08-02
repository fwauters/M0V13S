# Rapport de phase 0 — Squelette portable

> Dossier `docs/initialisation/` : un rapport par phase (`phase_0.md` →
> `phase_5.md`), écrit à la fin de chaque phase. Celui-ci est mis à jour au
> fil de la phase (documentation anti-crash), statut ci-dessous.

**Statut : TERMINÉE ET VALIDÉE** — étapes 0.1 → 0.12 livrées (un commit
par étape, branche `phase-0`, PR #1). Le critère de sortie (0.11, exe
lancé depuis le disque externe sur une machine B hors ligne) a été
**validé par l'utilisateur** : fenêtre, thèmes/langues, ping DB OK,
`data\` créé à côté de l'exe.

## Objectif de la phase

Un squelette Electron + Angular 22 **portable** : l'exe doit tourner depuis
une clé USB sur une autre machine, hors ligne, sans installation. Tous les
piliers techniques du projet sont branchés et démontrés (thèmes, i18n, IPC
typé, SQLite, packaging).

## Déroulé étape par étape

### 0.1 — Structure du workspace (commit `56f2de2`)
- `package.json` racine (backend + outillage), workspace pnpm (`ui`),
  `tsconfig.base.json` strict partagé avec alias `@shared/*`.
- **Décision en cours de route** : pnpm 10 bloque les scripts postinstall —
  liste blanche explicite dans `pnpm-workspace.yaml` (electron, esbuild,
  natifs du build Angular).

### 0.2 — Angular 22 + Tailwind v4 (commit `93ba4ca`)
- Scaffold Angular CLI 22.1 : **zoneless par défaut**, style SCSS, tests
  Vitest 4 + jsdom (le nouveau défaut Angular — s'aligne avec notre choix).
- Tailwind v4 branché via PostCSS (`.postcssrc.json`) dans une entrée CSS
  **séparée** (`src/tailwind.css`) : Tailwind ne doit pas passer par Sass.
- `baseHref: ./` pour le chargement `file://` en Electron packagé.
- **Imprévu résolu** : Angular CLI 22.1 exige Node ≥ 22.22.3, la machine
  était en 22.22.0 et nvm refusait de basculer depuis un shell non
  interactif. Node **22.23.2** a été déposé dans le dossier nvm
  (layout standard) ; il reste à l'utilisateur à exécuter
  `nvm use 22.23.2` pour son propre terminal. `engines.node` verrouillé.
- **Imprévu résolu** : TypeScript 6 déprécie `baseUrl` → alias `@shared/*`
  déclaré en `paths` relatifs, sans `baseUrl`.

### 0.3 — Thème Material M3 light/dark (commit `529fe28`)
- `mat.theme()` en `theme-type: color-scheme` : les couleurs M3 sont émises
  en `light-dark()`, la propriété CSS `color-scheme` de `<html>` décide.
  Défaut : suit le système (`light dark`).
- Polices **bundlées en local** (exigence hors-ligne) : Roboto via
  `@fontsource/roboto`, icônes via `material-icons` — aucun CDN.

### 0.4 — Transloco fr/en (commit `0c31d59`)
- Loader **statique** : les JSON de `ui/src/assets/i18n/` sont importés dans
  le bundle (pas de HTTP → fiable en `file://`, conforme hors-ligne).
- `LanguageService` et `ThemeService` à base de signaux : un seul signal
  pilote Material (`color-scheme`) ET Tailwind (classe `.dark`).
  Persistance temporaire en localStorage — TODO(phase 1) : table `settings`.
- Shell de démonstration : wordmark (police définitive en phase 3),
  sélecteur fr/en à chaud, bascule de thème. Règles respectées : directive
  `*transloco`, aucune chaîne en dur, aucun appel de méthode en template
  (signaux + pipe pur).

### 0.5 — Main process Electron (commit `e6e9a42`)
- Fenêtre sécurisée : `contextIsolation`, `sandbox`, `nodeIntegration` off.
- Dev : charge `http://localhost:4200` (ng serve) + DevTools détachés ;
  packagé : `file://…/ui/index.html`.
- Bundling esbuild (main + preload → CJS dans `dist-electron/`), scripts
  pnpm : `dev` (concurrently ui + watch esbuild + electron), `build`,
  `typecheck`, `test`, `package`.

### 0.6 — Contrat IPC typé (commit `8d77b46`)
- `shared/ipc.ts` = source de vérité (canaux + DTO) ; preload
  `contextBridge` expose `window.api` conforme à `WindowApi` ; côté UI,
  `ApiService` est l'unique façade (gère le cas « hors Electron »).
- Démonstration bout en bout : bouton « Tester le backend » → ping IPC →
  versions + état DB affichés dans le shell.

### 0.7 — SQLite + Drizzle + chemins (commit `88b1bed`)
- **Très bonne nouvelle technique** : better-sqlite3 v13 est passé en
  **N-API avec binaires embarqués** → fonctionne tel quel sous Node ET
  Electron, **aucun rebuild natif**, pas besoin de la toolchain Visual
  Studio. (pnpm déclenchait un `node-gyp rebuild` inutile à cause du
  `binding.gyp` : son build est volontairement exclu de la liste blanche.)
  Vérifié en réel : `SELECT` OK sous Node.
- Table `settings` + première migration versionnée (`pnpm db:generate`),
  ouverture en WAL + migrations appliquées à chaque démarrage.
- `paths.service` (lié Electron) + `paths.logic` (**pur, testé**) :
  data\ à côté de l'exe en packagé, à la racine du repo en dev ;
  conversion chemins absolus ↔ relatifs à la racine du lecteur.

### 0.8 — Socle de tests (commit `fe3945c`)
- Vitest racine (backend + règles transverses) ; 8 tests verts :
  - aller-retour relatif/absolu entre lecteurs différents (scénario
    portabilité : `E:\` → `D:\`), rejet des chemins hors lecteur ;
  - **complétude i18n** : jeux de clés strictement identiques dans tous les
    `assets/i18n/*.json` — une langue incomplète fait échouer la suite.
- UI : 2 tests (shell + wordmark) via `ng test` (Vitest Angular).

### 0.9 — prepare-tools (commit `6d68bd1`)
- Script Node sans dépendance npm (fetch + Expand-Archive) : ffprobe
  (gyan.dev, build essentials) et VLC portable win64 (dernière version
  détectée sur get.videolan.org). `tools\` reste hors repo.
- **Validé en réel** pour ffprobe : `tools\ffprobe.exe` → version 8.1.2.
  VLC sera téléchargé au moment utile (phase 4) — inutile d'alourdir le
  disque maintenant.

### 0.10 — Packaging portable (commit `be5d8e7`)
- electron-builder, cible **dossier** (`release\win-unpacked`) : c'est LE
  format portable — on copie le dossier sur le disque externe, point.
  (Un zip de distribution viendra avec la release, phase 5.)
- Validé en réel : dossier copié à un autre emplacement → fenêtre ouverte,
  `data\library.db` créée **à côté de l'exe**, tables `settings` +
  `__drizzle_migrations` présentes (migrations lues dans
  `resources\migrations`), asar actif, aucun rebuild natif.

#### L'enquête du crash silencieux (à connaître absolument)
L'exe packagé quittait instantanément : aucune fenêtre, aucun log, aucun
dialogue, pas de dossier userData. Fausses pistes explorées et innocentées
une à une : contrôle d'intégrité asar (désactivé pour test → toujours mort),
module natif better-sqlite3 (app témoin sous electron.exe brut → charge et
fonctionne parfaitement). Vraie cause, trouvée en instrumentant le main
packagé : **`ELECTRON_RUN_AS_NODE=1` hérité de l'hôte d'extension VS Code**
(qui exécute nos shells). Avec cette variable, tout exe Electron démarre en
mode Node pur : pas d'API Electron, pas de fenêtre — et l'app « meurt »
silencieusement. Sans la variable, tout fonctionne.
**Règle pratique** : pour tester un exe Electron depuis un terminal ouvert
par VS Code, faire `Remove-Item Env:\ELECTRON_RUN_AS_NODE` d'abord. Un
lancement normal (double-clic Explorateur) n'est pas concerné.
Bénéfice collatéral de l'enquête : better-sqlite3 v13 est formellement
validé sous Electron 43 sans rebuild.

### 0.11 — Test machine B — **À FAIRE PAR L'UTILISATEUR**
Critère de sortie de la phase. Procédure :
1. `pnpm package` (ou reprendre `release\win-unpacked` existant).
2. Copier le dossier `win-unpacked` sur le disque externe / la clé USB
   (le renommer `M0V13S` si souhaité).
3. Sur une **autre machine Windows, hors ligne** : double-cliquer
   `M0V13S.exe`.
4. Attendu : la fenêtre s'ouvre ; bascule de thème et de langue OK ;
   bouton « Tester le backend » → versions affichées et **DB OK** ;
   un dossier `data\` apparaît à côté de l'exe.
5. Cocher 0.11 dans TODO.md et merger la PR `phase-0`.

### 0.12 — Docs + PR (ce commit)
- CLAUDE.md : section « Commandes » remplie, prérequis dev.
- README / README.fr : section développement réelle.
- Ce rapport ; PR `phase-0` → `main` ouverte.

## Prérequis développeur

- Node **≥ 22.22.3** (exigence Angular CLI 22.1). La version 22.23.2 est
  installée dans nvm : `nvm use 22.23.2`.
- pnpm 10.
- Test d'un exe Electron depuis un terminal VS Code : retirer
  `ELECTRON_RUN_AS_NODE` (voir 0.10).

## Écarts au plan / décisions prises en route

- **Aucun rebuild natif nécessaire** (meilleur que prévu) : better-sqlite3
  v13 est N-API avec binaires embarqués — le risque « rebuild Electron »
  du PLAN § 8 disparaît ; la liste blanche pnpm exclut volontairement son
  build auto (`node-gyp` inutile).
- **Node monté en 22.23.2** (déposé dans nvm), exigence Angular CLI 22.1 ;
  `engines.node` verrouillé en conséquence.
- **VLC non téléchargé en phase 0** (inutile avant la phase 4) : le script
  `prepare-tools` le gère, validé en réel pour ffprobe.
- Persistance thème/langue en localStorage **temporaire**, migration vers
  la table `settings` planifiée en phase 1 (TODO marqués dans le code).
