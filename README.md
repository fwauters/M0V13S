# M0V13S

*[Version française ici / French version here: **README.fr.md**](README.fr.md)*

**M0V13S** is a portable, offline-first movie library manager and player for
Windows — a private, Netflix-style interface for the video files stored on
your (external) hard drive.

> **Status: in active development (pre-alpha).** Nothing to download yet.
> The full design document lives in [PLAN.md](PLAN.md) (French).

## The idea

Plug your external drive into any Windows machine, launch `M0V13S.exe`, and
browse your movie collection like a private streaming service — posters,
cast & crew, genres, custom tags, smart suggestions, resume-where-you-left-off —
then play anything with one click. No installation, no account, no internet
required.

## Core principles

- **Truly standalone** — nothing is ever installed on the host machine. The
  app, the player (portable VLC) and all data live on the drive itself.
- **Offline first** — everything works without internet. Being online only
  adds bonuses: metadata enrichment (TMDB), trailers, VLC updates.
- **Your folders are the source of truth** — metadata travels with your files
  as Kodi/Jellyfin-compatible sidecars (`.nfo` + `-poster.jpg` +
  `-fanart.jpg`). The internal SQLite database is just a rebuildable index:
  delete it, or drop the app next to a different collection, and everything
  reconstructs itself from the folders. Only what is *actually on the disk and
  qualified* is ever displayed.
- **Plays everything** — playback is delegated to a bundled portable VLC, so
  codec support does not depend on the app (MKV, HEVC, AC3/DTS audio, …).
  Playback position is tracked to power watched status and resume.

## Feature overview (planned v1)

- Netflix-style browsing: poster grid, horizontal rows, detail pages with
  cast, crew, genres, tags, trailer (when online).
- Combinable filters and sorting: genre, tag, actor, director, year, duration,
  watched/unwatched.
- Suggestion rows: resume, never watched, not watched in a long time,
  favorite genres, recently added.
- Scan wizard (admin mode): detects new files, extracts technical info
  (ffprobe), guesses the title, enriches from TMDB (original + French titles,
  cast, genres, posters), everything editable before saving. Files that
  arrive with their `.nfo` sidecars are imported silently — offline.
- Light / dark themes, switchable at any time.
- UI in English and French (extensible — adding a language is one JSON file).
- Admin mode behind a key combo + password, including a data view of the
  database tables. Movies first; the data model is series-ready.

## Tech stack

Electron (portable build) · Angular 22 (signals) · Angular Material + Tailwind
CSS · Transloco (i18n) · SQLite (better-sqlite3 + Drizzle ORM) ·
TMDB API · portable VLC · ffprobe · pnpm

## Development

Prerequisites: Node.js ≥ 22.22.3, pnpm 10.

```
pnpm install          # install workspace dependencies
pnpm dev              # ng serve + Electron with hot reload
pnpm test:all         # backend + UI test suites (includes i18n completeness)
pnpm build            # production build (Angular + Electron bundles)
pnpm package          # portable build → release\win-unpacked (copy to your drive)
pnpm prepare-tools    # download ffprobe + portable VLC into tools\
```

Third-party binaries (VLC, ffprobe) are **not** part of this repository — the
`prepare-tools` script fetches them at packaging time. Phase reports live in
`docs/initialisation/`.

## Third-party notices

- This product uses the **TMDB API** but is not endorsed or certified by
  TMDB. You need a free TMDB API key (entered in the app) to use metadata
  enrichment. https://www.themoviedb.org/
- **VLC media player** (VideoLAN) and **ffprobe** (FFmpeg) are distributed
  under their own licenses (GPL/LGPL) and are downloaded separately; they are
  not derivative parts of this project — the app launches them as external
  programs.

## License

[MIT](LICENSE)
