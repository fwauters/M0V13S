/**
 * Lance Electron en mode dev, avec un environnement ASSAINI.
 *
 * Pourquoi pas simplement `electron .` dans le script pnpm ?
 * Les terminaux ouverts par VS Code peuvent hériter de
 * `ELECTRON_RUN_AS_NODE=1` (hôte d'extension) : Electron démarre alors en
 * mode Node pur — aucune fenêtre, sortie immédiate, zéro message. Piège
 * déjà documenté (docs/initialisation/phase_0.md § 0.10) : on le neutralise
 * ici une fois pour toutes.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

// En Node pur, `require('electron')` retourne le CHEMIN de l'exécutable.
const require = createRequire(import.meta.url);
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
