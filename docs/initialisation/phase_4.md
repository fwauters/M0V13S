# Rapport de phase 4 — Lecture VLC & suivi de visionnage

> Doc anti-crash : écrite PENDANT la phase, complétée à chaque étape.
> Branche `phase-4`, un commit par étape. PR #5 ouverte en fin de phase —
> validation utilisateur avant merge.

## Objectif de la phase

Regarder ses films depuis l'app : lecture par le VLC portable embarqué
(`tools\vlc`, jamais installé sur la machine hôte), position suivie en
continu, reprise là où on s'était arrêté, « vu » automatique en fin de
film — et le tout visible dans l'UI (boutons Lire/Reprendre, badge vu,
marquage manuel, filtre vu/pas vu du browse déjà en place depuis la 3.4).

## Déroulé étape par étape

### 4.1 — vlc.service : lecture + suivi de position — FAIT

- **`vlc.logic` (pur, testé)** : parsing tolérant de
  `/requests/status.json` (état/position/durée, `length` -1 ou 0 →
  inconnue), seuils (« vu » à **90 %** de la durée ; pas de reprise sous
  **60 s** ni une fois vu), construction des arguments VLC et de
  l'authentification HTTP.
- **Arguments de lancement** : `--fullscreen`, `--play-and-exit`,
  `--no-video-title-show`, **`--no-one-instance`** (sans lui, un VLC déjà
  ouvert sur la machine récupérerait le fichier et le suivi serait
  perdu), interface HTTP **locale uniquement** (`127.0.0.1`, IPv4
  explicite — règle maison) sur **port attribué dynamiquement par l'OS**
  (PLAN § 8) et protégée par un **mot de passe jetable** ;
  `--start-time` pour la reprise.
- **`watch.service`** (upserts `watch_state`) : reprise sauvegardée en
  continu pendant la lecture (un crash ne perd presque rien),
  `registerCompletion` (vu + compteur + date, reprise effacée),
  `setCompleted` manuel (vu → compteur ≥ 1 ; pas vu → drapeau retiré,
  historique conservé ; reprise effacée dans les deux sens — décision :
  « pas vu » = repartir de zéro). **Personnel** : jamais exporté `.nfo`.
- **`vlc.service`** : premier fichier PRÉSENT de la fiche (ordre des
  parties), spawn, polling 2 s, « vu » enregistré UNE fois par session,
  finalisation à la sortie du process (exit/error dédupliqués) +
  notification `onEnded`. **Une lecture à la fois** (`alreadyPlaying`).
  Cas dégradés sans exception : `vlcMissing` (tools\vlc absent),
  `fileMissing`, `error`.
- **Contrat IPC** : `player:play`, `player:set-completed`,
  événement `player:ended` (main → renderer, toutes fenêtres) ;
  `MovieDetail` expose `watch` (WatchStateInfo).
- **Toutes les dépendances d'environnement injectables** (spawn, fetch,
  chemins, port, période de polling) : les tests pilotent un faux
  process (EventEmitter) et de faux statuts — 26 nouveaux tests.

### 4.2 — UI de lecture et de suivi — FAIT

- **Fiche (hero)** : bouton principal **« Lire »** / **« Reprendre à
  1 h 23 »** (position formatée — utilitaire pur testé), bouton
  « Depuis le début » quand une reprise existe ; le trailer passe en
  bouton secondaire. Échec de lancement → message explicite sous les
  boutons, jamais bloquant.
- **Badge « Vu »** dans la méta du hero + bouton de **marquage manuel**
  vu / pas vu (le main renvoie le nouvel état, la fiche est patchée sans
  rechargement complet).
- **Fin de lecture** : abonnement à `player:ended` → rechargement de la
  fiche (reprise/vu à jour) ; désinscription à la destruction du
  composant (même mécanique que la progression du scan).
- **Browse** : coche « vu » discrète en coin d'affiche (`movie.seen`
  alimentait déjà le filtre vu/pas vu de la 3.4).

### 4.3 — Fin de phase (ce commit)

- Dépendances : rien à monter (TS 7 toujours exclu — Angular 22.1 exige
  ~6.0) ; `pnpm audit` : 0 vulnérabilité.
- **Packaging corrigé pour le standalone intégral** : electron-builder
  n'embarquait PAS `tools\` (la convention implicite était une copie
  manuelle sur le disque). `extraFiles` copie désormais `tools\`
  (ffprobe + VLC) à côté de l'exe — vérifié : exe lancé, fenêtre
  visible, `tools\vlc\vlc.exe` et `tools\ffprobe.exe` présents dans
  `release\win-unpacked`. **`pnpm prepare-tools` doit être exécuté avant
  `pnpm package`.**
- Docs à jour (TODO.md, REPRISE.md, ce rapport), PR #5 ouverte.

## Décisions prises en cours de phase (documentées, non bloquantes)

1. **Multi-parties (CD1/CD2)** : la lecture démarre sur le premier
   fichier présent ; la reprise (position seule, au niveau du film)
   s'applique à ce fichier. Enchaînement automatique des parties :
   possible plus tard (playlist VLC) — la quasi-totalité des films sont
   mono-fichier.
2. **Pas de bouton « Stop » dans l'UI** : on ferme VLC (ou fin du film,
   `--play-and-exit`) — la position est de toute façon sauvegardée en
   continu pendant la lecture.
3. **Reprise** : ignorée sous 60 s (repartir du début coûte moins que de
   reprendre au milieu du générique d'ouverture) et effacée dès que le
   film est vu.
4. **Le suivi reste au niveau du film** (`watch_state`), comme prévu au
   PLAN — rien à migrer.

## État des tests

- **142 tests backend** (dont 26 nouveaux : vlc.logic, watch.service sur
  DB temporaire, vlc.service avec faux process/statuts) et **32 tests
  UI** — tous verts. Typecheck strict, build prod et packaging OK.

## Validation utilisateur attendue (avant merge de la PR #5)

1. `git pull` sur `phase-4`, `nvm use 22.23.2`, `pnpm i` ;
   `tools\vlc` : déjà téléchargé ici via `pnpm prepare-tools --only=vlc`.
2. `pnpm dev` → fiche d'un film : **« Lire »** lance VLC en plein écran.
3. Quitter VLC en cours de film → la fiche affiche **« Reprendre à … »**
   (et « Depuis le début ») ; reprendre → VLC repart à la position.
4. Regarder (ou avancer à) plus de 90 % → fermer : badge **« Vu »** sur
   la fiche, coche en coin d'affiche dans le browse, filtre « Vus » de
   la 3.4 le retrouve.
5. **Marquer comme vu / non vu** à la main ; vérifier la table
   `watch_state` dans la vue admin si curieux.
6. Cas limites : renommer `tools\vlc` → message « VLC introuvable » non
   bloquant ; lancer deux lectures → « déjà en cours ».
7. Packagé : `pnpm package` → copier `release\win-unpacked` (VLC inclus
   désormais) sur le disque, retester une lecture depuis l'exe.
8. Si tout est bon : merge de la PR #5 → phase 5 (intelligence &
   finitions).
