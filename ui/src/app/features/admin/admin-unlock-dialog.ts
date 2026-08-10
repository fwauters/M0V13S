import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatDialogRef } from '@angular/material/dialog';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { TranslocoDirective } from '@jsverse/transloco';

import { ApiService } from '../../core/services/api.service';

/**
 * Dialogue de déverrouillage du mode admin : mot de passe vérifié côté
 * main (scrypt — le hash ne descend jamais). Ferme avec `true` en cas
 * de succès (AdminLockService bascule alors le signal).
 */
@Component({
  selector: 'app-admin-unlock-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoDirective, FormsModule, MatButton, MatFormField, MatLabel, MatInput, MatIcon],
  template: `
    <ng-container *transloco="let t">
      <div class="flex w-80 flex-col gap-3 p-6">
        <div class="flex items-center gap-2">
          <mat-icon>lock</mat-icon>
          <h2 class="text-lg font-medium">{{ t('admin.unlock.title') }}</h2>
        </div>

        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{ t('admin.unlock.password') }}</mat-label>
          <input
            matInput
            type="password"
            cdkFocusInitial
            [(ngModel)]="password"
            (keydown.enter)="submit()"
          />
        </mat-form-field>

        @if (wrong()) {
          <p class="text-sm font-medium text-red-600 dark:text-red-400">
            {{ t('admin.unlock.wrong') }}
          </p>
        }

        <div class="flex justify-end gap-2">
          <button matButton (click)="dialogRef.close(false)">{{ t('common.cancel') }}</button>
          <button matButton="filled" [disabled]="checking()" (click)="submit()">
            {{ t('admin.unlock.unlock') }}
          </button>
        </div>
      </div>
    </ng-container>
  `,
})
export class AdminUnlockDialog {
  private readonly api = inject(ApiService);
  protected readonly dialogRef = inject<MatDialogRef<AdminUnlockDialog, boolean>>(MatDialogRef);

  /** Saisie en cours. */
  protected password = '';
  /** Vérification en cours (désactive le bouton). */
  protected readonly checking = signal(false);
  /** Dernière tentative refusée. */
  protected readonly wrong = signal(false);

  /** Vérifie côté main et ferme en cas de succès. */
  protected async submit(): Promise<void> {
    this.checking.set(true);
    try {
      if (await this.api.verifyAdminPassword(this.password)) {
        this.dialogRef.close(true);
      } else {
        this.wrong.set(true);
        this.password = '';
      }
    } finally {
      this.checking.set(false);
    }
  }
}
