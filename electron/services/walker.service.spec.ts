/**
 * Tests du parcours des racines de bibliothèque sur un arbre temporaire
 * réel (fs). `driveRoot` est ici le dossier temporaire : la logique de
 * relativisation est la même qu'avec une vraie racine de lecteur.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { walkLibraryRoots } from './walker.service';

let tmpDir: string;

/** Crée un fichier (et ses dossiers) sous tmpDir avec un contenu factice. */
function touch(relPath: string, content = 'x'): void {
  const full = path.join(tmpDir, ...relPath.split('/'));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm0v13s-walker-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('walkLibraryRoots', () => {
  it('trouve les vidéos récursivement, ignore le reste', () => {
    touch('Films/Alien (1979)/alien.mkv');
    touch('Films/Alien (1979)/alien.nfo'); // sidecar : ignoré
    touch('Films/Sub/Deep/movie.MP4'); // extension en majuscules : trouvée
    touch('Films/notes.txt'); // non vidéo : ignoré
    touch('Autres/hors-racine.mkv'); // hors racine scannée : ignoré

    const found = walkLibraryRoots(tmpDir, ['Films']);
    expect(found.map((f) => f.relPath).sort()).toEqual([
      'Films/Alien (1979)/alien.mkv',
      'Films/Sub/Deep/movie.MP4',
    ]);
  });

  it('remonte taille et mtime des fichiers', () => {
    touch('Films/a.mkv', 'contenu-de-test');
    const found = walkLibraryRoots(tmpDir, ['Films']);
    expect(found).toHaveLength(1);
    expect(found[0]!.sizeBytes).toBe('contenu-de-test'.length);
    expect(found[0]!.mtimeMs).toBeGreaterThan(0);
  });

  it('cumule plusieurs racines', () => {
    touch('Films/a.mkv');
    touch('Docus/b.mkv');
    const found = walkLibraryRoots(tmpDir, ['Films', 'Docus']);
    expect(found).toHaveLength(2);
  });

  it('tolère une racine absente (disque réorganisé)', () => {
    touch('Films/a.mkv');
    const found = walkLibraryRoots(tmpDir, ['Films', 'Inexistant']);
    expect(found).toHaveLength(1);
  });
});
