/**
 * Point d'entrée du MAIN PROCESS Electron — le « backend » de M0V13S.
 * Responsabilités : fenêtre, cycle de vie, initialisation DB, enregistrement
 * des handlers IPC. Le renderer (Angular) ne touche jamais fs/DB/réseau :
 * tout passe par le contrat IPC (shared/ipc.ts) via le preload.
 */
import { BrowserWindow, app } from 'electron';
import path from 'node:path';

import { AppDatabaseHandle, openDatabase } from './db/client';
import { registerLibraryIpc } from './ipc/library.ipc';
import { registerSettingsIpc } from './ipc/settings.ipc';
import { registerSystemIpc } from './ipc/system.ipc';
import { registerTmdbIpc } from './ipc/tmdb.ipc';
import { AdminTablesService } from './services/admin-tables.service';
import { ConformityService } from './services/conformity.service';
import { LibraryService } from './services/library.service';
import { getDbPath, getMigrationsDir } from './services/paths.service';
import { ScannerService } from './services/scanner.service';
import { SettingsService } from './services/settings.service';
import { TmdbService } from './services/tmdb.service';

/**
 * URL du serveur de dev Angular (ng serve) — utilisée hors packaging.
 * IPv4 EXPLICITE partout (ng serve --host 127.0.0.1, wait-on
 * tcp:127.0.0.1:4200, et ce loadURL) : `localhost` peut résoudre en IPv6
 * (::1) selon la machine, et le trio ne se trouvait pas (wait-on qui
 * attendait indéfiniment — bug relevé en validation de phase 1).
 */
const DEV_SERVER_URL = 'http://127.0.0.1:4200';

/** Base applicative, ouverte au démarrage (null si l'ouverture a échoué). */
let dbHandle: AppDatabaseHandle | null = null;

/** Crée la fenêtre principale et charge l'UI (dev server ou build). */
function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    // Fond sombre pendant le chargement pour éviter le flash blanc.
    backgroundColor: '#101014',
    show: false,
    webPreferences: {
      // Sécurité : le renderer est isolé, seul le preload expose une API.
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  if (app.isPackaged) {
    // Build packagé : l'UI Angular est embarquée à côté de dist-electron
    // (voir electron-builder.yml, mapping ui/dist/ui/browser -> ui).
    void win.loadFile(path.join(__dirname, '..', 'ui', 'index.html'));
  } else {
    void win.loadURL(DEV_SERVER_URL);
    win.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  // L'échec d'ouverture de la DB ne doit pas empêcher l'app de démarrer :
  // le ping IPC remontera dbOk=false et l'UI pourra l'afficher.
  try {
    dbHandle = openDatabase(getDbPath(), getMigrationsDir());
  } catch (error) {
    console.error('Ouverture de la base impossible :', error);
    dbHandle = null;
  }

  const db = dbHandle?.db ?? null;
  registerSystemIpc(db);

  // Les services métier ne sont instanciés que si la DB est ouverte ;
  // les handlers IPC gèrent explicitement le cas dégradé (null).
  if (db !== null) {
    const settingsService = new SettingsService(db);
    registerSettingsIpc(settingsService);
    registerTmdbIpc(new TmdbService(settingsService));
    registerLibraryIpc({
      settings: settingsService,
      conformity: new ConformityService(db, settingsService),
      library: new LibraryService(db),
      scanner: new ScannerService(db, settingsService),
      adminTables: new AdminTablesService(db),
    });
  } else {
    registerSettingsIpc(null);
    registerTmdbIpc(null);
    registerLibraryIpc(null);
  }

  createWindow();
});

// Windows : quitter quand toutes les fenêtres sont fermées
// (pas de convention « dock » comme sur macOS).
app.on('window-all-closed', () => {
  app.quit();
});

// Fermer proprement la connexion SQLite à la sortie (flush du WAL —
// important sur un disque externe qui sera débranché).
app.on('will-quit', () => {
  dbHandle?.close();
});
