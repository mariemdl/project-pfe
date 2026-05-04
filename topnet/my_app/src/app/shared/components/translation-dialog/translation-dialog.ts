import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';

export interface TranslationDialogData {
  originalLanguage?: string;
  languages: string[];
}

export interface TranslationDialogResult {
  language: string;
  translateAllFields: boolean;
}

@Component({
  selector: 'app-translation-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatRadioModule,
    MatCheckboxModule,
    MatButtonModule
  ],
  templateUrl: './translation-dialog.html',
  styleUrls: ['./translation-dialog.css']
})
export class TranslationDialogComponent {
  selectedLanguage = 'none';
  translateAllFields = true;
  warningMessage = '';

  constructor(
    public dialogRef: MatDialogRef<TranslationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: TranslationDialogData
  ) {}

  onLanguageChange() {
    // Only show warning if originalLanguage exists AND selectedLanguage matches it AND it's not 'none'
    if (this.data.originalLanguage && 
        this.selectedLanguage !== 'none' && 
        this.selectedLanguage === this.data.originalLanguage) {
      this.warningMessage = `⚠️ The selected language is the same as the original (${this.data.originalLanguage}). Please choose a different language for translation.`;
    } else {
      this.warningMessage = '';
    }
  }

  isConfirmDisabled(): boolean {
    // Button is NEVER disabled - user can always choose "No translation"
    // Even with warning, we let them confirm (they might ignore warning)
    return false;
  }

  onConfirm(): void {
    // Always allow confirm, even with warning
    this.dialogRef.close({
      language: this.selectedLanguage,
      translateAllFields: this.translateAllFields
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }
}