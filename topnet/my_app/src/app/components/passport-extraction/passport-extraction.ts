import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { FileSizePipe } from '../../shared/pipes/file-size-pipe';
import { TranslationDialogComponent, TranslationDialogData, TranslationDialogResult } from '../../shared/components/translation-dialog/translation-dialog';
import { environment } from '../../environments/environment';

export interface PassportDocument {
  type: 'images' | 'file' | null;
  // Image mode
  dataPageFile?: File | null;
  photoPageFile?: File | null;
  dataPagePreview?: string | null;
  photoPagePreview?: string | null;
  // File mode
  file?: File | null;
  // Status
  status?: 'pending' | 'processing' | 'ready' | 'completed';
}

@Component({
  selector: 'app-passport-extraction',
  standalone: true,
  imports: [CommonModule, FormsModule, FileSizePipe],
  templateUrl: './passport-extraction.html',
  styleUrls: ['./passport-extraction.css']
})
export class PassportExtractionComponent implements OnDestroy {
  passports: PassportDocument[] = [this.createEmptyPassport()];
  uploadMode: 'images' | 'file' = 'images';
  isProcessing = false;  // Loading state
  
  // Drag state for image mode
  activeDragSet: number | null = null;
  activeDragSide: 'dataPage' | 'photoPage' | null = null;
  
  // Drag state for file mode
  activeFileDrag: number | null = null;

  // Polling
  private pollInterval: any = null;
  private pollTimeout: any = null;

  constructor(
    private http: HttpClient,
    private dialog: MatDialog,
    private router: Router
  ) {}

  createEmptyPassport(): PassportDocument {
    return { type: null, status: 'pending' };
  }

  addPassport() {
    this.passports.push(this.createEmptyPassport());
  }

  removePassport(index: number) {
    this.passports.splice(index, 1);
    if (this.passports.length === 0) this.addPassport();
  }

  // Image mode handlers
  onImageSelected(event: Event, index: number, side: 'dataPage' | 'photoPage') {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      this.handleImageFile(input.files[0], index, side);
    }
  }

  onDragOver(event: DragEvent, index: number, side: 'dataPage' | 'photoPage') {
    event.preventDefault();
    this.activeDragSet = index;
    this.activeDragSide = side;
  }

  onDragLeave(event: DragEvent, index: number, side: 'dataPage' | 'photoPage') {
    event.preventDefault();
    if (this.activeDragSet === index && this.activeDragSide === side) {
      this.activeDragSet = null;
      this.activeDragSide = null;
    }
  }

  onDrop(event: DragEvent, index: number, side: 'dataPage' | 'photoPage') {
    event.preventDefault();
    this.activeDragSet = null;
    this.activeDragSide = null;
    if (event.dataTransfer?.files?.[0]) {
      this.handleImageFile(event.dataTransfer.files[0], index, side);
    }
  }

  private handleImageFile(file: File, index: number, side: 'dataPage' | 'photoPage') {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (JPEG, PNG)');
      return;
    }

    const passport = this.passports[index];
    
    // If switching from file mode, reset
    if (passport.type === 'file') {
      if (!confirm('This passport already has a file. Replace with images?')) return;
      passport.file = null;
    }

    passport.type = 'images';
    
    if (side === 'dataPage') {
      passport.dataPageFile = file;
      const reader = new FileReader();
      reader.onload = e => passport.dataPagePreview = e.target?.result as string;
      reader.readAsDataURL(file);
    } else {
      passport.photoPageFile = file;
      const reader = new FileReader();
      reader.onload = e => passport.photoPagePreview = e.target?.result as string;
      reader.readAsDataURL(file);
    }

    this.updatePassportStatus(passport);
  }

  // File mode handlers
  onFileSelected(event: Event, index: number) {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      this.handleFileUpload(input.files[0], index);
    }
  }

  onFileDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    this.activeFileDrag = index;
  }

  onFileDragLeave(event: DragEvent, index: number) {
    event.preventDefault();
    if (this.activeFileDrag === index) {
      this.activeFileDrag = null;
    }
  }

  onFileDrop(event: DragEvent, index: number) {
    event.preventDefault();
    this.activeFileDrag = null;
    if (event.dataTransfer?.files?.[0]) {
      this.handleFileUpload(event.dataTransfer.files[0], index);
    }
  }

  private handleFileUpload(file: File, index: number) {
    const passport = this.passports[index];
    
    // If switching from image mode, reset
    if (passport.type === 'images') {
      if (!confirm('This passport already has images. Replace with a single file?')) return;
      passport.dataPageFile = null;
      passport.photoPageFile = null;
      passport.dataPagePreview = null;
      passport.photoPagePreview = null;
    }

    passport.type = 'file';
    passport.file = file;
    this.updatePassportStatus(passport);
  }

  // Remove file
  removeFile(index: number, target: 'dataPage' | 'photoPage' | 'file') {
    const passport = this.passports[index];
    
    if (target === 'dataPage') {
      passport.dataPageFile = null;
      passport.dataPagePreview = null;
    } else if (target === 'photoPage') {
      passport.photoPageFile = null;
      passport.photoPagePreview = null;
    } else if (target === 'file') {
      passport.file = null;
    }

    // If all files are gone, reset type
    if ((passport.type === 'images' && !passport.dataPageFile && !passport.photoPageFile) ||
        (passport.type === 'file' && !passport.file)) {
      passport.type = null;
    }
    
    this.updatePassportStatus(passport);
  }

  // Status helpers
  isPassportReady(passport: PassportDocument): boolean {
    if (passport.type === 'images') {
      return !!(passport.dataPageFile && passport.photoPageFile);
    } else if (passport.type === 'file') {
      return !!passport.file;
    }
    return false;
  }

  private updatePassportStatus(passport: PassportDocument) {
    passport.status = this.isPassportReady(passport) ? 'ready' : 'pending';
  }

  canExport(): boolean {
    return this.passports.some(p => this.isPassportReady(p));
  }

  // STEP 1: Detect language first
  detectLanguage() {
    const readyPassports = this.passports.filter(p => this.isPassportReady(p));

    if (readyPassports.length === 0) {
      alert('No complete passports to process');
      return;
    }

    this.isProcessing = true;

    // Build FormData for language detection (send first passport)
    const formData = new FormData();
    const passport = readyPassports[0];
    
    if (passport.type === 'images') {
      formData.append('data_page', passport.dataPageFile!);
      formData.append('photo_page', passport.photoPageFile!);
    } else {
      formData.append('file', passport.file!);
    }

    // Call language detection endpoint
    this.http.post<{ language: string }>(`${environment.apiUrl}/api/detect-language`, formData)
      .subscribe({
        next: (response) => {
          this.isProcessing = false;
          // Open translation dialog with detected language
          this.openTranslationDialog(response.language);
        },
        error: (err) => {
          this.isProcessing = false;
          console.error('Language detection failed', err);
          // If detection fails, open dialog without original language
          this.openTranslationDialog(undefined);
        }
      });
  }

  // STEP 2: Open translation dialog with detected original language
  openTranslationDialog(originalLanguage?: string) {
    const dialogData: TranslationDialogData = {
      originalLanguage: originalLanguage,
      languages: ['English', 'French', 'Arabic', 'Spanish', 'German']
    };

    const dialogRef = this.dialog.open(TranslationDialogComponent, {
      width: '450px',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe((result: TranslationDialogResult) => {
      if (result) {
        this.extractData(result.language, result.translateAllFields);
      }
    });
  }

  // STEP 3: Extract data with translation
  extractData(targetLanguage: string, translateAllFields: boolean) {
    const readyPassports = this.passports.filter(p => this.isPassportReady(p));
    
    if (readyPassports.length === 0) {
      alert('No passports to process');
      return;
    }

    this.isProcessing = true;

    // Build FormData - send all passports
    const formData = new FormData();
    
    // IMPORTANT: Use 'files' as the parameter name (plural!) as required by the API
    readyPassports.forEach((passport) => {
      if (passport.type === 'images') {
        // For image mode, we need to send both files with the same 'files' key
        formData.append('files', passport.dataPageFile!);
        formData.append('files', passport.photoPageFile!);
        passport.status = 'processing';
      } else {
        // For file mode, send the single file with 'files' key
        formData.append('files', passport.file!);
        passport.status = 'processing';
      }
    });

    if (targetLanguage && targetLanguage !== 'none') {
      formData.append('translate_to', targetLanguage);
      formData.append('translate_all', String(translateAllFields));
    }

    // Log what we're sending (for debugging)
    console.log('Sending passport extraction request:');
    console.log('- Total files:', this.countFiles(readyPassports));
    for (let pair of (formData as any).entries()) {
      if (pair[0] === 'files') {
        console.log(`- ${pair[0]}:`, pair[1] instanceof File ? pair[1].name : pair[1]);
      } else {
        console.log(`- ${pair[0]}:`, pair[1]);
      }
    }

    this.http.post(`${environment.apiUrl}/api/extract/passport`, formData)
      .subscribe({
        next: (response: any) => {
          console.log('✅ Extraction successful', response);
          
          // Don't navigate immediately - poll for completion
          if (response && response.batch_id) {
            this.pollBatchUntilComplete(response.batch_id);
          } else {
            this.isProcessing = false;
            alert('No batch ID received');
          }
        },
        error: (err) => {
          console.error('❌ Extraction failed', err);
          console.error('Error details:', err.error);
          
          readyPassports.forEach(p => p.status = 'ready');
          this.isProcessing = false;
          
          let errorMessage = 'Extraction failed: ';
          if (err.error && err.error.detail) {
            if (Array.isArray(err.error.detail)) {
              errorMessage += err.error.detail.map((d: any) => d.msg).join(', ');
            } else {
              errorMessage += err.error.detail;
            }
          } else if (err.message) {
            errorMessage += err.message;
          } else {
            errorMessage += 'Unknown error';
          }
          
          alert(errorMessage);
        }
      });
  }

  // Helper to count total files
  private countFiles(passports: PassportDocument[]): number {
    let count = 0;
    passports.forEach(p => {
      if (p.type === 'images') {
        count += 2; // data page + photo page
      } else if (p.type === 'file') {
        count += 1;
      }
    });
    return count;
  }

  // Poll for batch completion
  private pollBatchUntilComplete(batchId: number) {
    console.log(`⏳ Polling for batch ${batchId} completion...`);
    
    // Clear any existing intervals/timeouts
    this.clearPolling();
    
    // Poll every 2 seconds
    this.pollInterval = setInterval(() => {
      this.http.get(`${environment.apiUrl}/api/batch/${batchId}/progress`)
        .subscribe({
          next: (progress: any) => {
            console.log('Batch progress:', progress);
            
            if (progress.status === 'completed') {
              console.log(`✅ Batch ${batchId} completed!`);
              this.clearPolling();
              
              // Update passport statuses
              this.passports.forEach(p => {
                if (p.status === 'processing') {
                  p.status = 'completed';
                }
              });
              
              this.isProcessing = false;
              
              // Now navigate to results
              this.router.navigate(['/extraction/results', batchId]);
            } else {
              console.log(`⏳ Batch still processing: ${progress.status}`);
            }
          },
          error: (err) => {
            console.error('Error polling batch progress:', err);
            this.clearPolling();
            this.isProcessing = false;
            alert('Error checking processing status. Please check the results page manually.');
            this.router.navigate(['/extraction/results', batchId]);
          }
        });
    }, 2000); // Poll every 2 seconds
    
    // Stop polling after 60 seconds (timeout)
    this.pollTimeout = setTimeout(() => {
      this.clearPolling();
      if (this.isProcessing) {
        this.isProcessing = false;
        alert('Processing is taking longer than expected. Please check the results page manually.');
        this.router.navigate(['/extraction/results', batchId]);
      }
    }, 60000);
  }

  private clearPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
  }

  // Clean up on component destroy
  ngOnDestroy() {
    this.clearPolling();
  }
}