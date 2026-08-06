import { Component, inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';

/** Données du dialogue : textes DÉJÀ traduits par l'appelant. */
export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

/**
 * Dialogue de confirmation générique (Material). Utilisé notamment pour
 * la suppression de fiche — JAMAIS de suppression sans passer par ici
 * (décision PLAN § 6.2.1). Retourne true si confirmé.
 */
@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose, MatButton],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>{{ data.message }}</mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton [matDialogClose]="false">{{ data.cancelLabel }}</button>
      <button matButton="filled" [matDialogClose]="true">{{ data.confirmLabel }}</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
