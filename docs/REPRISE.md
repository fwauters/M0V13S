# REPRISE DE SESSION — état exact du projet

> Doc vivante : mise à jour à la FIN de chaque session de travail pour
> reprendre exactement au même point. Dernière mise à jour : 2026-08-09,
> fin de la session « phase 3 ».

## Où on en est — résumé en 3 lignes

1. **Phases 0, 1 et 2 : terminées, validées, mergées** (PR #1, #2, #3).
2. **Phase 3 (UI « Netflix ») : TERMINÉE et poussée — PR #4 OUVERTE, en
   attente de la validation utilisateur puis du merge.** Tout y est :
   charte (brand, header sticky, nav), browse en rangées + grille avec
   cache de miniatures (`data\thumbs`, nativeImage), fiche cinéma (hero
   backdrop, casting, trailer YouTube online-only), filtres/tris
   combinables en mémoire, wordmark bundlé.
3. **Ensuite : phase 4 (lecture VLC & suivi)** — branche `phase-4` depuis
   main mergé, TODO 4.1 → 4.3 (vlc.service spawn + HTTP status,
   watch_state vu/reprise).

## Actions en attente CÔTÉ UTILISATEUR (avant toute suite)

1. Valider la phase 3 (procédure détaillée : phase_3.md § Validation) —
   l'essentiel : rangées + miniatures, filtres combinés persistants,
   fiche hero + trailer, thèmes/langues.
2. **Choisir la police du wordmark** (comparaison visuelle fournie ;
   Space Mono appliquée par défaut). Après le choix : retirer les 2
   dépendances @fontsource non retenues + MAJ CLAUDE.md (ligne Polices).
3. Puis **merger la PR #4**.

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
  déclencherait un node-gyp voué à l'échec). Même esprit : les miniatures
  passent par `nativeImage` (intégré à Electron), pas par sharp & co.
- **PowerShell 5.1 mange les guillemets doubles dans les arguments des
  exe natifs** : messages de commit et corps de PR via fichier
  (`git commit -F`, `gh --body-file`), jamais en argument inline.
- **Jamais de `Set-Content` PowerShell sur un fichier UTF-8** (mojibake) —
  toujours les outils d'édition dédiés. Attention aussi aux échappements
  `\uXXXX` dans les chaînes passées par JSON : ils deviennent des
  caractères littéraux (préférer du code sans regex Unicode).
- `gh` CLI : installé et authentifié (`C:\Program Files\GitHub CLI\gh.exe`
  si PATH pas rafraîchi). Repo : https://github.com/fwauters/M0V13S
- Confidentialité : jamais de nom réel/email dans le code — pseudonyme
  **S13N** si besoin.

## Snapshot technique (fin de session)

- Stack : Electron 43 + Angular 22.1.1 (zoneless) + Material M3
  light/dark + Tailwind v4 (tokens brand + font-wordmark) + Transloco
  fr/en + better-sqlite3/Drizzle (12 tables, migrations 0000-0002) +
  ag-grid 36.1 + @fontsource (Roboto + 3 candidates wordmark).
- **113 tests backend + 23 tests UI verts** ; audit 0 vulnérabilité ;
  packaging portable revalidé (exe lancé avec fenêtre).
- Protocole images : `m0v13s-img://img/...` (original) et
  `m0v13s-img://thumb/...` (cache `data\thumbs`, auto-invalidé par mtime).
- Browse : liste enrichie chargée une fois, rangées/filtres/tris en
  computed (BrowseStore, état persistant entre navigations).
- Branches : `main` (phases 0-2), `phase-3` (poussée, PR #4 ouverte).
- Rapports : phase_0 à phase_2 (validés), phase_3.md (en validation).

## Plan de la phase 4 (dès la PR #4 mergée)

Créer la branche `phase-4` depuis `main` fraîchement mergé, puis dérouler
TODO 4.1 → 4.3 : `vlc.service` (spawn du VLC portable de `tools\vlc`,
fullscreen, port HTTP local choisi dynamiquement, polling de la position,
`--start-time` pour la reprise ; tests avec statut HTTP mocké) →
`watch_state` (vu automatique > 90 %, reprise, marquage manuel vu/pas vu
depuis l'UI — le browse expose déjà `seen` et son filtre) → fin de phase
(deps, docs, portabilité, rapport, PR #5). Prérequis outil :
`pnpm prepare-tools --only=vlc` si `tools\vlc` absent.
