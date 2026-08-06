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

### 2.1 — nfo.service (lecture/écriture XML Kodi, atomique) — EN COURS
### 2.2 — Import silencieux des `.nfo` au scan — À VENIR
### 2.3 — tmdb.service (recherche fr-FR, mapping, HTTP mocké) — À VENIR
### 2.4 — UI scan : recherche TMDB + choix du film — À VENIR
### 2.5 — Poster/fanart en sidecars + cache miniatures — À VENIR
### 2.6 — Scan hors-ligne + « réessayer l'enrichissement » — À VENIR
### 2.7 — Fin de phase (deps, docs, portabilité, PR) — À VENIR
