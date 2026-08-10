/**
 * Handlers IPC du verrou admin. Le hash ne quitte JAMAIS le main :
 * le renderer ne fait que poser des questions (défini ? correct ?).
 * DB indisponible → comportement « aucun mot de passe » (jamais bloquant).
 */
import { ipcMain } from 'electron';

import { IPC } from '@shared/ipc';
import type { AdminService } from '../services/admin.service';

export function registerAdminLockIpc(admin: AdminService | null): void {
  ipcMain.handle(IPC.adminLock.hasPassword, (): boolean => admin?.hasPassword() ?? false);

  ipcMain.handle(
    IPC.adminLock.verify,
    (_event, password: string): boolean => admin?.verify(password) ?? true,
  );

  ipcMain.handle(
    IPC.adminLock.setPassword,
    (_event, newPassword: string, currentPassword: string | null): boolean =>
      admin?.setPassword(newPassword, currentPassword) ?? false,
  );
}
