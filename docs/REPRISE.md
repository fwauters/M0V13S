# REPRISE DE SESSION — état exact du projet

> Doc vivante : mise à jour à la FIN de chaque session de travail pour
> reprendre exactement au même point. Dernière mise à jour : 2026-08-03,
> fin de la session « phases 0 et 1 ».

## Où on en est — résumé en 3 lignes

1. **Phases 0 et 1 : terminées, validées, mergées** (PR #1, #2).
2. **Phase 2 : quasi terminée** sur la branche `phase-2` — 2.1 à 2.5
   livrées (+ scan complet forcé et gestion de la clé TMDB dans l'app,
   demandes utilisateur en cours de phase). La clé API de l'utilisateur
   est configurée et fonctionnelle.
3. **Reste** : 2.6 (hors-ligne OK par construction ; question ouverte :
   bouton « réessayer l'enrichissement » par fiche, ou couvert par le
   scan complet ?) et 2.7 (fin de phase : deps, docs, packaging, PR #3,
   validation utilisateur).

## Action en attente CÔTÉ UTILISATEUR (avant toute suite)

Répondre à la question 2.6 (bouton par fiche vs scan complet suffisant),
puis valider la phase 2 en conditions réelles : scan complet d'un dossier
avec la clé TMDB active → choix des films → fiches enrichies + `.nfo` +
`-poster.jpg`/`-fanart.jpg` à côté des vidéos.

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
  natif, et il ne doit JAMAIS être dans `onlyBuiltDependencies` (pnpm
  déclencherait un node-gyp voué à l'échec).
- **Jamais de `Set-Content` PowerShell sur un fichier UTF-8** (mojibake) —
  toujours les outils d'édition dédiés.
- `gh` CLI : installé et authentifié (`C:\Program Files\GitHub CLI\gh.exe`
  si PATH pas rafraîchi). Repo : https://github.com/fwauters/M0V13S
- Confidentialité : jamais de nom réel/email dans le code — pseudonyme
  **S13N** si besoin.

## Snapshot technique (fin de session)

- Stack en place : Electron 43 + Angular 22.1 (zoneless) + Material M3
  light/dark + Tailwind v4 + Transloco fr/en (loader statique) +
  better-sqlite3/Drizzle (12 tables, migrations 0000+0001) + ag-grid.
- 51 tests backend + 6 tests UI verts ; packaging portable vérifié.
- Branches : `main` (phase 0 mergée), `phase-1` (poussée, PR #2 ouverte).
- Rapports : docs/initialisation/phase_0.md (validé) et phase_1.md.

## Plan de la phase 2 (dès la PR #2 mergée)

Créer la branche `phase-2` depuis `main` fraîchement mergé, puis dérouler
TODO 2.1 → 2.7 : nfo.service (lecture/écriture XML Kodi, atomique) →
import silencieux en masse des `.nfo` (scénario partage, hors ligne) →
tmdb.service (recherche fr-FR, mapping, HTTP mocké en tests) → UI scan
avec recherche TMDB et choix du bon film → poster/fanart en SIDECARS +
cache de miniatures → mode hors-ligne du scan + bouton « réessayer
l'enrichissement » → fin de phase (deps, docs, rapport phase_2.md, PR).
Point de vigilance : la clé API TMDB est saisie par l'utilisateur et vit
dans `settings` — jamais commitée. Attribution TMDB déjà dans le README.
