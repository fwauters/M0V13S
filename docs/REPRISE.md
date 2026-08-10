# REPRISE DE SESSION — état exact du projet

> Doc vivante : mise à jour à la FIN de chaque session de travail pour
> reprendre exactement au même point. Dernière mise à jour : 2026-08-10,
> fin de la session « phase 4 ».

## Où on en est — résumé en 3 lignes

1. **Phases 0 à 4 : terminées, validées, mergées** (PR #1 à #5).
   Restructuration actée (2026-08-10) : la release quitte la phase 5 →
   **phase 6 « Recette générale & release »** (checklist `docs/RECETTE.md`
   déroulée par l'utilisateur, corrections par lots, puis v1.0).
2. **Phase 5 (intelligence & finitions) : TERMINÉE et poussée — PR #6
   OUVERTE, en attente de validation utilisateur puis merge.**
   Suggestions (Reprendre/Jamais vus/genre favori/pas revus), verrou
   admin (mot de passe scrypt via guard, SANS combo — décision
   utilisateur), MAJ VLC (staging + bascule au démarrage + secours),
   édition contrôlée vue admin, écran /setup, polish, e2e smoke.
3. **Ensuite : phase 6** — rédiger `docs/RECETTE.md` (inventaire réel du
   code), recette utilisateur, corrections par lots, release v1.0.

## Actions en attente CÔTÉ UTILISATEUR (avant toute suite)

1. Valider la phase 5 (procédure : phase_5.md § Validation) —
   suggestions, verrou admin, MAJ VLC, édition admin (fiche + .nfo),
   premier lancement (renommer data\), `pnpm e2e`.
2. Puis **merger la PR #6**.

## Méthode de travail établie (récap opérationnel)

- **Une branche + une PR par phase, un commit par étape** (revert facile).
- Chaque étape : code TOUT commenté (TSDoc) + tests + i18n fr/en complet.
- **Docs vivantes à chaque adaptation** : CLAUDE.md (bible, auto-chargée),
  PLAN.md (plan détaillé), TODO.md (cases cochées au fil de l'eau),
  docs/initialisation/phase_N.md (rapport par phase, anti-crash, écrit
  PENDANT la phase), et CE fichier en fin de session.
- Décision non triviale → demander à l'utilisateur (options +
  recommandation) ; sans réponse claire → décider et documenter.
- Fin de phase : `pnpm outdated` / `audit`, packaging vérifié, rapport,
  PR ; validation utilisateur avant merge.

## Pièges d'environnement à ne pas redécouvrir

- **`ELECTRON_RUN_AS_NODE=1` est hérité des shells VS Code** : à retirer
  (`Remove-Item Env:\ELECTRON_RUN_AS_NODE`) avant de lancer un exe
  Electron en test, sinon mort silencieuse immédiate.
- **Node ≥ 22.22.3 requis** (Angular CLI 22.1). La 22.23.2 est installée
  dans nvm ; mes shells doivent préfixer :
  `$env:Path = "$env:NVM_HOME\v22.23.2;$env:Path"`.
- **better-sqlite3 v13 = N-API avec binaires embarqués** : AUCUN rebuild
  natif, jamais dans `onlyBuiltDependencies`. Même esprit : miniatures
  via `nativeImage` (intégré), pas de sharp & co.
- **`pnpm prepare-tools` AVANT `pnpm package`** : electron-builder copie
  `tools\` (ffprobe + VLC) à côté de l'exe (extraFiles) — sans le
  prepare-tools préalable, le paquet part sans les binaires.
- **VLC en spawn : toujours `--no-one-instance`** — sinon un VLC déjà
  ouvert sur la machine avale le fichier et notre process (et le suivi
  de position) se termine aussitôt.
- **PowerShell 5.1 mange les guillemets doubles dans les arguments des
  exe natifs** : messages de commit et corps de PR via fichier
  (`git commit -F`, `gh --body-file`), jamais en argument inline.
- **Jamais de `Set-Content` PowerShell sur un fichier UTF-8** (mojibake).
  Attention aussi aux échappements `\uXXXX` dans les chaînes passées par
  JSON : ils deviennent des caractères littéraux.
- `gh` CLI : installé et authentifié (`C:\Program Files\GitHub CLI\gh.exe`
  si PATH pas rafraîchi). Repo : https://github.com/fwauters/M0V13S
- Confidentialité : jamais de nom réel/email dans le code — pseudonyme
  **S13N** si besoin.

## Snapshot technique (fin de session du 2026-08-10)

- Stack : Electron 43 + Angular 22.1.1 (zoneless) + Material M3 (identité
  bi-thème : sarcelle clair / ambre sombre, overrides ciblés `html.dark`,
  ag-grid accentColor aligné) + Tailwind v4 + Transloco fr/en +
  better-sqlite3/Drizzle (migrations 0000-0003) + VLC portable 3.0.23 +
  ffprobe dans `tools\` + Playwright (dev, e2e Electron — pas de
  navigateur téléchargé, son postinstall bloqué par pnpm 10 convient).
- **163 tests backend + 37 tests UI verts** ; audit 0 vulnérabilité
  (TS 7 exclu — Angular 22.1 exige ~6.0) ; packaging + e2e OK.
- Services main : paths, settings, filename, ffprobe (langues de pistes
  incluses), conformity, walker, scanner (+updateMediaField), library,
  nfo, images, thumbs, tmdb, grouping, vlc (+logic), watch, vlc-updater
  (+logic), admin (scrypt), admin-tables. IPC par domaines : system,
  settings, library, scanner, admin (+updateMediaField), tmdb, player,
  vlcUpdate, adminLock.
- UI : routes `/` (setupGuard), `/setup`, `/browse` + `/movie/:id`
  (classicModeGuard), `/scan` + `/admin/data` (adminGuard). Stores :
  LibraryStore, BrowseStore (filtres persistants + suggestions),
  AdminLockService (signal unlocked), ThemeService, LanguageService,
  ConnectivityService.
- Commandes de session : `pnpm dev` / `test` / `test:ui` / `typecheck` /
  `build` / `package` / **`pnpm e2e`** (exige `pnpm package` avant ;
  SUPPRIME release\win-unpacked\data pour partir propre — release\ est
  un artefact jetable).
- Branches : `main` (phases 0-4 mergées), `phase-5` (poussée, PR #6
  ouverte). Rapports : phase_0 à phase_4 (validés), phase_5.md (en
  validation). Le dossier `data\` de DEV (racine du repo) contient la
  bibliothèque de test de l'utilisateur — ne pas y toucher.

## Plan de la phase 6 (dès la PR #6 mergée)

Créer la branche `phase-6` depuis `main` fraîchement mergé, puis :
rédiger `docs/RECETTE.md` — la checklist EXHAUSTIVE générée depuis
l'inventaire réel du code (routes/écrans, services main, canaux IPC,
réglages, clés i18n, thèmes) — organisée par parcours avec cases à
cocher et colonne remarques ; l'utilisateur la déroule (chaque écran
dans les DEUX thèmes et les DEUX langues, systèmes : conformité,
sidecars/partage, hors-ligne intégral, lecture/reprise/vu, MAJ VLC,
portabilité réelle machine B) ; corrections par lots (un commit par lot,
tests de non-régression, RECETTE re-cochée) ; PUIS release v1.0 : build
final, tag git, GitHub Release, READMEs finalisés (guide + captures).
