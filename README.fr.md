# M0V13S

*[English version here / Version anglaise ici: **README.md**](README.md)*

**M0V13S** est un gestionnaire et lecteur de vidéothèque portable et
hors-ligne pour Windows — une interface privée « façon Netflix » pour les
fichiers vidéo stockés sur votre disque dur (externe).

> **Statut : en cours de développement (pré-alpha).** Rien à télécharger pour
> l'instant. Le document de conception complet est dans [PLAN.md](PLAN.md).

## L'idée

Branchez votre disque externe sur n'importe quelle machine Windows, lancez
`M0V13S.exe`, et parcourez votre collection comme un service de streaming
privé — affiches, casting, genres, tags personnalisés, suggestions, reprise de
lecture — puis lisez n'importe quel film en un clic. Sans installation, sans
compte, sans internet.

## Principes fondateurs

- **Vraiment standalone** — rien n'est jamais installé sur la machine hôte.
  L'application, le lecteur (VLC portable) et toutes les données vivent sur le
  disque lui-même.
- **Hors-ligne d'abord** — tout fonctionne sans internet. Être en ligne
  n'apporte que des bonus : enrichissement des fiches (TMDB), trailers, mises
  à jour de VLC.
- **Vos dossiers sont la source de vérité** — les métadonnées voyagent avec
  vos fichiers sous forme de sidecars compatibles Kodi/Jellyfin (`.nfo` +
  `-poster.jpg` + `-fanart.jpg`). La base SQLite interne n'est qu'un index
  reconstructible : supprimez-la, ou posez l'app à côté d'une autre
  collection, et tout se reconstruit depuis les dossiers. Seul ce qui est
  *réellement sur le disque et qualifié* est affiché.
- **Lit tout** — la lecture est déléguée à un VLC portable embarqué : le
  support des codecs ne dépend pas de l'app (MKV, HEVC, audio AC3/DTS, …).
  La position de lecture est suivie pour alimenter le statut « vu » et la
  reprise.

## Fonctionnalités (v1 prévue)

- Navigation façon Netflix : grille d'affiches, rangées horizontales, fiches
  détaillées avec casting, équipe, genres, tags, trailer (en ligne).
- Filtres et tris combinables : genre, tag, acteur, réalisateur, année,
  durée, vu/pas vu.
- Rangées de suggestions : à reprendre, jamais vus, pas vus depuis longtemps,
  genres favoris, ajoutés récemment.
- Assistant de scan (mode admin) : détecte les nouveaux fichiers, extrait les
  infos techniques (ffprobe), devine le titre, enrichit depuis TMDB (titres
  VO/VF, casting, genres, affiches), tout est modifiable avant validation.
  Les fichiers arrivés avec leurs sidecars `.nfo` sont importés
  silencieusement — hors ligne.
- Thèmes light / dark, commutables à tout moment.
- Interface en français et en anglais (extensible — ajouter une langue = un
  fichier JSON).
- Mode admin derrière un combo de touches + mot de passe, avec une vue
  « données » des tables de la base. Films d'abord ; le modèle de données est
  prêt pour les séries.

## Stack technique

Electron (build portable) · Angular 22 (signals) · Angular Material +
Tailwind CSS · Transloco (i18n) · SQLite (better-sqlite3 + Drizzle ORM) ·
API TMDB · VLC portable · ffprobe · pnpm

## Développement

Prérequis : Node.js ≥ 20, pnpm.

```
# Les commandes seront documentées ici dès que le squelette existera (phase 0) :
# dev, test, build, package, prepare-tools (télécharge VLC portable + ffprobe)
```

Les binaires tiers (VLC, ffprobe) ne font **pas** partie de ce dépôt — le
script `prepare-tools` les récupère au moment du packaging.

## Mentions tierces

- Ce produit utilise l'**API TMDB** mais n'est ni approuvé ni certifié par
  TMDB. Une clé API TMDB gratuite (saisie dans l'app) est nécessaire pour
  l'enrichissement des fiches. https://www.themoviedb.org/
- **VLC media player** (VideoLAN) et **ffprobe** (FFmpeg) sont distribués
  sous leurs propres licences (GPL/LGPL) et téléchargés séparément ; ils ne
  sont pas des parties dérivées de ce projet — l'app les lance comme
  programmes externes.

## Licence

[MIT](LICENSE)
