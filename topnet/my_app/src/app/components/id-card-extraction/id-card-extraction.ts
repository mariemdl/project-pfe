import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { FileSizePipe } from '../../shared/pipes/file-size-pipe';
import { TranslationDialogComponent, TranslationDialogData, TranslationDialogResult } from '../../shared/components/translation-dialog/translation-dialog';
import { environment } from '../../environments/environment';
import { AuthService } from '../../services/auth.service';

export interface IDCard {
  type: 'images' | 'file' | null;
  frontFile?: File | null;
  backFile?: File | null;
  frontPreview?: string | null;
  backPreview?: string | null;
  file?: File | null;
}

@Component({
  selector: 'app-id-card-extraction',
  standalone: true,
  imports: [CommonModule, FileSizePipe],
  templateUrl: './id-card-extraction.html',
  styleUrls: ['./id-card-extraction.css']
})
export class IdCardExtractionComponent implements OnDestroy {
  cards: IDCard[] = [this.createEmptyCard()];
  isProcessing = false;
  isLanguageDetecting = false;
  private pollInterval: any;

  activeDragSet: number | null = null;
  activeDragSide: 'front' | 'back' | null = null;
  activeFileDrag: number | null = null;

  constructor(
    private http: HttpClient,
    private dialog: MatDialog,
    private router: Router,
    private authService: AuthService
  ) {}

  createEmptyCard(): IDCard {
    return { type: null };
  }

  addCard() {
    this.cards.push(this.createEmptyCard());
  }

  removeCard(index: number) {
    this.cards.splice(index, 1);
    if (this.cards.length === 0) this.addCard();
  }

  onImageSelected(event: Event, cardIndex: number, side: 'front' | 'back') {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) this.handleImageFile(input.files[0], cardIndex, side);
  }

  onDragOver(event: DragEvent, cardIndex: number, side: 'front' | 'back') {
    event.preventDefault();
    this.activeDragSet = cardIndex;
    this.activeDragSide = side;
  }

  onDragLeave(event: DragEvent, cardIndex: number, side: 'front' | 'back') {
    event.preventDefault();
    if (this.activeDragSet === cardIndex && this.activeDragSide === side) {
      this.activeDragSet = null;
      this.activeDragSide = null;
    }
  }

  onDrop(event: DragEvent, cardIndex: number, side: 'front' | 'back') {
    event.preventDefault();
    this.activeDragSet = null;
    this.activeDragSide = null;
    if (event.dataTransfer?.files?.[0]) this.handleImageFile(event.dataTransfer.files[0], cardIndex, side);
  }

  private handleImageFile(file: File, cardIndex: number, side: 'front' | 'back') {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (JPEG, PNG)');
      return;
    }
    const card = this.cards[cardIndex];
    if (card.type === 'file') {
      if (!confirm('This card already has a combined file. Replace it with images?')) return;
      card.file = null;
    }
    if (side === 'front') {
      card.frontFile = file;
      const reader = new FileReader();
      reader.onload = e => card.frontPreview = e.target?.result as string;
      reader.readAsDataURL(file);
    } else {
      card.backFile = file;
      const reader = new FileReader();
      reader.onload = e => card.backPreview = e.target?.result as string;
      reader.readAsDataURL(file);
    }
    card.type = 'images';
  }

  onFileSelected(event: Event, cardIndex: number) {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) this.handleFileUpload(input.files[0], cardIndex);
  }

  onFileDragOver(event: DragEvent, cardIndex: number) {
    event.preventDefault();
    this.activeFileDrag = cardIndex;
  }

  onFileDragLeave(event: DragEvent, cardIndex: number) {
    event.preventDefault();
    if (this.activeFileDrag === cardIndex) this.activeFileDrag = null;
  }

  onFileDrop(event: DragEvent, cardIndex: number) {
    event.preventDefault();
    this.activeFileDrag = null;
    if (event.dataTransfer?.files?.[0]) this.handleFileUpload(event.dataTransfer.files[0], cardIndex);
  }

  private handleFileUpload(file: File, cardIndex: number) {
    const card = this.cards[cardIndex];
    if (card.type === 'images') {
      if (!confirm('This card already has images. Replace with a single file?')) return;
      card.frontFile = null;
      card.backFile = null;
      card.frontPreview = null;
      card.backPreview = null;
    }
    card.type = 'file';
    card.file = file;
  }

  removeFile(cardIndex: number, target: 'front' | 'back' | 'file') {
    const card = this.cards[cardIndex];
    if (target === 'front') {
      card.frontFile = null;
      card.frontPreview = null;
    } else if (target === 'back') {
      card.backFile = null;
      card.backPreview = null;
    } else if (target === 'file') {
      card.file = null;
    }
    if ((card.type === 'images' && !card.frontFile && !card.backFile) ||
        (card.type === 'file' && !card.file)) {
      card.type = null;
    }
  }

  canExport(): boolean {
    return this.cards.some(card => {
      if (card.type === 'images') return !!(card.frontFile || card.backFile);
      if (card.type === 'file') return !!card.file;
      return false;
    });
  }

  async detectLanguage() {
    // Prevent double execution
    if (this.isLanguageDetecting || this.isProcessing) {
      console.log('Already processing, skipping...');
      return;
    }

    const readyCards = this.cards.filter(card => {
      if (card.type === 'images') return !!(card.frontFile || card.backFile);
      if (card.type === 'file') return !!card.file;
      return false;
    });

    if (readyCards.length === 0) {
      alert('No complete cards to process');
      return;
    }

    this.isLanguageDetecting = true;
    const card = readyCards[0];

    // Create form data for language detection
    const formData = new FormData();
    if (card.type === 'images') {
      formData.append('file', (card.frontFile || card.backFile)!);
    } else {
      formData.append('file', card.file!);
    }

    try {
      // Get extracted text from backend first
      const extractResponse = await this.http.post<{ text: string }>(
        `${environment.apiUrl}/api/extract-text`, 
        formData,
        { headers: { 'Authorization': `Bearer ${this.authService.getToken()}` } }
      ).toPromise();

      const extractedText = extractResponse?.text || '';

      // Use backend language detection (works for all documents, any browser)
      console.log('Using backend language detection');
      const langResponse = await this.http.post<{ language: string; confidence: number }>(
        `${environment.apiUrl}/api/detect-language`,
        { text: extractedText },
        { headers: { 'Authorization': `Bearer ${this.authService.getToken()}` } }
      ).toPromise();
      
      this.openTranslationDialog(langResponse?.language || 'English');
      
    } catch (err) {
      console.error('Language detection failed:', err);
      this.openTranslationDialog(undefined);
    } finally {
      this.isLanguageDetecting = false;
    }
  }

  openTranslationDialog(originalLanguage?: string) {
    const dialogData: TranslationDialogData = {
      originalLanguage: originalLanguage,
      languages: ['English', 'French', 'Arabic', 'Spanish', 'German']
    };

    const dialogRef = this.dialog.open(TranslationDialogComponent, {
      width: '450px',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe(async (result: TranslationDialogResult) => {
      if (result) {
        await this.extractData(result.language, result.translateAllFields);
      }
    });
  }

  pollBatchProgress(batchId: number) {
    console.log('Starting to poll for batch:', batchId);
    
    this.pollInterval = setInterval(() => {
      this.http.get(`${environment.apiUrl}/api/batch/${batchId}/progress`)
        .subscribe({
          next: (progress: any) => {
            console.log('Progress update:', progress);
            
            if (progress.status === 'completed') {
              console.log('Batch completed! Navigating to results...');
              clearInterval(this.pollInterval);
              this.isProcessing = false;
              this.router.navigate(['/extraction/results', batchId]);
            } else if (progress.status === 'failed') {
              console.error('Batch failed:', progress);
              clearInterval(this.pollInterval);
              this.isProcessing = false;
              alert('Processing failed: ' + (progress.error_message || 'Unknown error'));
            } else {
              console.log(`Processing: ${progress.processed_documents}/${progress.total_documents} documents`);
            }
          },
          error: (err) => {
            console.error('Progress check failed:', err);
          }
        });
    }, 2000);
  }

  async extractData(targetLanguage: string, translateAllFields: boolean) {
    const readyCards = this.cards.filter(card => {
      if (card.type === 'images') return !!(card.frontFile || card.backFile);
      if (card.type === 'file') return !!card.file;
      return false;
    });

    if (readyCards.length === 0) {
      alert('No complete cards to process');
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;

    const formData = new FormData();

    for (const card of readyCards) {
      if (card.type === 'images') {
        if (card.frontFile && card.backFile) {
          // Combine front+back into a single image so the AI sees the full card
          const combined = await this.combineImages(card.frontFile, card.backFile);
          formData.append('files', combined);
        } else {
          formData.append('files', (card.frontFile || card.backFile)!);
        }
      } else {
        formData.append('files', card.file!);
      }
    }

    if (targetLanguage !== 'none') {
      formData.append('translate_to', targetLanguage);
      formData.append('translate_all', String(translateAllFields));
    }

    console.log('========== SENDING REQUEST ==========');
    console.log('URL:', `${environment.apiUrl}/api/extract/id-card`);
    const files = formData.getAll('files');
    console.log(`Total files: ${files.length}`);
    files.forEach((file, i) => {
      if (file instanceof File) {
        console.log(`  File ${i + 1}: ${file.name} (${file.type}, ${file.size} bytes)`);
      }
    });
    
    if (targetLanguage !== 'none') {
      console.log('Translate to:', targetLanguage);
      console.log('Translate all:', translateAllFields);
    }
    console.log('====================================');

    this.http.post(`${environment.apiUrl}/api/extract/id-card`, formData, {
      headers: {
        'Authorization': `Bearer ${this.authService.getToken()}`
      }
    }).subscribe({
      next: (response: any) => {
        console.log('✅ Upload successful:', response);
        
        if (response?.batch_id) {
          this.pollBatchProgress(response.batch_id);
        } else {
          this.isProcessing = false;
          alert('Extraction started but no batch ID returned');
        }
      },
      error: (err) => {
        this.isProcessing = false;
        console.error('❌ Extraction failed:', err);
        
        let errorMessage = 'Extraction failed: ';
        if (err.error?.detail) {
          if (Array.isArray(err.error.detail)) {
            errorMessage += err.error.detail.map((d: any) => d.msg).join(', ');
          } else {
            errorMessage += err.error.detail;
          }
        } else {
          errorMessage += err.message || 'Unknown error';
        }
        
        alert(errorMessage);
      }
    });
  }

  private combineImages(frontFile: File, backFile: File): Promise<File> {
    return new Promise((resolve) => {
      const frontImg = new Image();
      const backImg = new Image();
      const frontURL = URL.createObjectURL(frontFile);
      const backURL = URL.createObjectURL(backFile);

      frontImg.onload = () => {
        backImg.onload = () => {
          const gap = 16;
          const maxH = Math.max(frontImg.naturalHeight, backImg.naturalHeight);
          const canvas = document.createElement('canvas');
          canvas.width = frontImg.naturalWidth + gap + backImg.naturalWidth;
          canvas.height = maxH;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(frontImg, 0, Math.floor((maxH - frontImg.naturalHeight) / 2));
          ctx.drawImage(backImg, frontImg.naturalWidth + gap, Math.floor((maxH - backImg.naturalHeight) / 2));
          URL.revokeObjectURL(frontURL);
          URL.revokeObjectURL(backURL);
          canvas.toBlob(blob => {
            resolve(new File([blob!], 'id_card_combined.jpg', { type: 'image/jpeg' }));
          }, 'image/jpeg', 0.93);
        };
        backImg.src = backURL;
      };
      frontImg.src = frontURL;
    });
  }

  ngOnDestroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }
}