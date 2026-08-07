/**
 * Tests de la logique pure de regroupement en dossier.
 */
import { describe, expect, it } from 'vitest';

import {
  isLooseFile,
  movieFolderName,
  parentDirOf,
  sanitizeFolderName,
} from './grouping.logic';

describe('sanitizeFolderName / movieFolderName', () => {
  it('construit « Titre (Année) », titre seul sans année', () => {
    expect(movieFolderName('Alien', 1979)).toBe('Alien (1979)');
    expect(movieFolderName('Alien', null)).toBe('Alien');
  });

  it('assainit les caractères interdits Windows et les fins de nom', () => {
    expect(movieFolderName('Alien: Covenant', 2017)).toBe('Alien Covenant (2017)');
    expect(sanitizeFolderName('Qui suis-je ?')).toBe('Qui suis-je');
    expect(sanitizeFolderName('A.I. ')).toBe('A.I');
    expect(sanitizeFolderName('***')).toBe('Film'); // repli si tout est interdit
  });
});

describe('isLooseFile', () => {
  const roots = ['Films', 'Docus/Nature'];

  it('vrai pour un fichier posé directement dans une racine', () => {
    expect(isLooseFile('Films/alien.mkv', roots)).toBe(true);
    expect(isLooseFile('Docus/Nature/ours.mkv', roots)).toBe(true);
  });

  it('faux pour un fichier déjà dans un sous-dossier', () => {
    expect(isLooseFile('Films/Alien (1979)/alien.mkv', roots)).toBe(false);
    expect(parentDirOf('Films/Alien (1979)/alien.mkv')).toBe('Films/Alien (1979)');
  });
});
