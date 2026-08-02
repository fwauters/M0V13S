# Rapport de phase 0 — Squelette portable

> Dossier `docs/initialisation/` : un rapport par phase (`phase_0.md` →
> `phase_5.md`), écrit à la fin de chaque phase. Celui-ci est mis à jour au
> fil de la phase (documentation anti-crash), statut ci-dessous.

**Statut : EN COURS** — étapes 0.1 → 0.9 livrées et committées ;
0.10 (packaging) en cours ; 0.11 (test machine B) à faire par l'utilisateur ;
0.12 (docs + PR) à suivre.

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

### 0.10 — Packaging portable — EN COURS
### 0.11 — Test machine B — À FAIRE PAR L'UTILISATEUR
### 0.12 — Docs + PR — À VENIR

## Prérequis développeur (nouveau)

- Node **≥ 22.22.3** (exigence Angular CLI 22.1). La version 22.23.2 est
  installée dans nvm : `nvm use 22.23.2`.
- pnpm 10.
