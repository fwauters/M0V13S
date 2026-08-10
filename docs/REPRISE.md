# REPRISE DE SESSION — état exact du projet

> Doc vivante : mise à jour à la FIN de chaque session de travail pour
> reprendre exactement au même point. Dernière mise à jour : 2026-08-10,
> fin de la session « phase 4 ».

## Où on en est — résumé en 3 lignes

1. **Phases 0 à 3 : terminées, validées, mergées** (PR #1 à #4 — la
   phase 3 inclut les ajustements post-validation : identité bi-thème
   sarcelle/ambre partout, trailer + langues éditables, Space Mono).
2. **Phase 4 (lecture VLC & suivi) : TERMINÉE et poussée — PR #5
   OUVERTE, en attente de la validation utilisateur puis du merge.**
   vlc.service (spawn portable, HTTP local port dynamique, polling),
   watch.service (reprise continue, vu > 90 %, marquage manuel), UI
   (Lire/Reprendre, badges vus), packaging embarquant désormais tools\.
3. **Ensuite : phase 5 (intelligence & finitions)** — TODO 5.1 → 5.8
   (suggestions, verrou admin, MAJ VLC, édition admin, premier
   lancement, polish, e2e smoke, release v1.0).

## Actions en attente CÔTÉ UTILISATEUR (avant toute suite)

1. Valider la phase 4 (procédure détaillée : phase_4.md § Validation) —
   l'essentiel : « Lire » lance le VLC embarqué plein écran, quitter en
   cours → « Reprendre à … », > 90 % → badge « Vu » + coche browse,
   marquage manuel, messages non bloquants (VLC absent, déjà en cours).
2. Puis **merger la PR #5**.

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

## Snapshot technique (fin de session)

- Stack : Electron 43 + Angular 22.1.1 (zoneless) + Material M3 (identité
  bi-thème : sarcelle clair / ambre sombre, overrides ciblés `html.dark`,
  ag-grid accentColor aligné) + Tailwind v4 + Transloco fr/en +
  better-sqlite3/Drizzle (migrations 0000-0003) + VLC portable 3.0.23 +
  ffprobe dans `tools\`.
- **142 tests backend + 32 tests UI verts** ; audit 0 vulnérabilité ;
  packaging portable vérifié AVEC tools embarqués (exe + fenêtre OK).
- Lecture : `player:play` → premier fichier présent, VLC HTTP 127.0.0.1
  port dynamique + mot de passe jetable, polling 2 s, reprise continue,
  vu > 90 % (une fois), `player:ended` → l'UI recharge.
- Branches : `main` (phases 0-3), `phase-4` (poussée, PR #5 ouverte).
- Rapports : phase_0 à phase_3 (validés), phase_4.md (en validation).

## Plan de la phase 5 (dès la PR #5 mergée)

Créer la branche `phase-5` depuis `main` fraîchement mergé, puis dérouler
TODO 5.1 → 5.8 : rangées de suggestions (SQL dédié : à reprendre, jamais
vus, pas vus depuis longtemps, genre favori, ajoutés récemment) → verrou
admin (combo touches + scrypt, définition au premier lancement) →
vlc-updater (vérification/téléchargement en mode admin, bascule au
redémarrage, version de secours) → édition contrôlée de la vue admin
(via services métier, réécriture .nfo garantie) → écran de premier
lancement (racines, clé TMDB, mot de passe admin) → polish UI
(animations, focus clavier, états vides, accessibilité) → e2e smoke sur
build packagé → release v1.0 (tag, GitHub Release, READMEs + captures).
