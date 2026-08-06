# Rapport de phase 2 — Sidecars & enrichissement TMDB

> Doc vivante anti-crash : mise à jour à chaque étape, statut ci-dessous.

**Statut : EN COURS** — démarrée après merge de la PR #2 (phase 1 validée
avec 5 correctifs de validation). Branche `phase-2`, un commit par étape.

## Objectif de la phase

Les dossiers de contenu deviennent réellement LE maître (principe
fondateur n° 2) : chaque fiche s'écrit en sidecar `.nfo` (XML Kodi) à côté
de sa vidéo, les images (poster/fanart) arrivent en sidecars via TMDB, et
un dossier partagé complet se réimporte silencieusement, hors ligne. La
clé API TMDB est saisie par l'utilisateur et vit dans `settings` — jamais
commitée.

## Déroulé étape par étape

### 2.1 — nfo.service (lecture/écriture XML Kodi, atomique) — FAIT
- `fast-xml-parser` (pur JS) ; fiche `MovieNfo` complète : titres VO/VF,
  année, synopsis, note perso, tmdbId (`<uniqueid type="tmdb">`),
  réalisateurs, scénaristes (`<credits>`), acteurs (+ personnage + ordre),
  genres, tags. `watch_state` jamais exporté (personnel).
- Écriture ATOMIQUE (tmp + rename, même dossier) ; parseur TOLÉRANT :
  balises inconnues ignorées (Kodi/Jellyfin/tinyMediaManager), valeur
  unique normalisée en tableau, uniqueid imdb ignoré au profit du tmdb,
  XML illisible ou racine non-movie → null (jamais d'exception).
- Piège évité : `parseTagValue: false` — un titre « 1917 » reste une
  chaîne. 7 tests (aller-retour complet et minimal, fixture Kodi réelle,
  invalides, écriture disque atomique sans résidu .tmp).
### 2.2 — Import silencieux des `.nfo` au scan — FAIT
- Le scénario « partage » fonctionne : un fichier arrivé avec son `.nfo`
  est importé pendant le scan, sans question, HORS LIGNE. L'import passe
  APRÈS le calcul des re-liens (un renommage garde sa fiche au lieu d'en
  créer une seconde) et NE réécrit PAS le `.nfo` existant (préserve les
  champs d'autres outils qu'on ne modélise pas).
- `qualify()` écrit désormais le sidecar `.nfo` à chaque qualification
  (règle : sidecars = reflet exact de l'index) — échec d'écriture non
  bloquant (rattrapé à la prochaine édition).
- Déduplication des fiches par `tmdbId` (CD1/CD2 partagés, enrichissement
  à venir) ; les acteurs portent leur PERSONNAGE (venu des `.nfo`, bientôt
  de TMDB) ; racine de lecteur injectable pour tester sur dossier
  temporaire. UI : section « Importés automatiquement (n) » dans le scan.
- 5 nouveaux tests (import, non-réimport, non-réécriture du .nfo,
  regroupement par tmdbId, écriture du .nfo au qualify).

### Décision en cours de phase (validée avec l'utilisateur)
La **clé API TMDB se gère DANS l'app** (pas seulement en phase 5) : carte
sur l'écran d'accueil — saisie, statut masqué, bouton « Tester » (3 états :
valide / invalide / hors ligne). Canal IPC dédié : la clé complète ne
redescend jamais au renderer (statut masqué uniquement).
### 2.3 — tmdb.service (recherche fr-FR, mapping, HTTP mocké) — À VENIR
### 2.4 — UI scan : recherche TMDB + choix du film — À VENIR
### 2.5 — Poster/fanart en sidecars + cache miniatures — À VENIR
### 2.6 — Scan hors-ligne + « réessayer l'enrichissement » — À VENIR
### 2.7 — Fin de phase (deps, docs, portabilité, PR) — À VENIR
