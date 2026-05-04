import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { FileSizePipe } from '../../shared/pipes/file-size-pipe';
import { TranslationDialogComponent, TranslationDialogData, TranslationDialogResult } from '../../shared/components/translation-dialog/translation-dialog';
import { environment } from '../../environments/environment';

export interface InvoiceDocument {
  type: 'file' | null;
  file?: File | null;
  status?: 'pending' | 'processing' | 'completed';
  invoiceCount?: number;  // Number of invoices detected in the file
}

@Component({
  selector: 'app-invoice-extraction',
  standalone: true,
  imports: [CommonModule, FileSizePipe],
  templateUrl: './invoice-extraction.html',
  styleUrls: ['./invoice-extraction.css']
})
export class InvoiceExtractionComponent {
  invoices: InvoiceDocument[] = [this.createEmptyInvoice()];
  activeDragIndex: number | null = null;
  isProcessing = false;  // Loading state
  private pollInterval: any = null;
  private pollTimeout: any = null;

  constructor(
    private http: HttpClient,
    private dialog: MatDialog,
    private router: Router
  ) {}

  createEmptyInvoice(): InvoiceDocument {
    return { type: null, status: 'pending' };
  }

  addInvoice() {
    this.invoices.push(this.createEmptyInvoice());
  }

  removeInvoice(index: number) {
    this.invoices.splice(index, 1);
    if (this.invoices.length === 0) this.addInvoice();
  }

  // Drag & drop handlers
  onDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    this.activeDragIndex = index;
  }

  onDragLeave(event: DragEvent, index: number) {
    event.preventDefault();
    if (this.activeDragIndex === index) {
      this.activeDragIndex = null;
    }
  }

  onDrop(event: DragEvent, index: number) {
    event.preventDefault();
    this.activeDragIndex = null;
    if (event.dataTransfer?.files?.[0]) {
      this.handleFileUpload(event.dataTransfer.files[0], index);
    }
  }

  onFileSelected(event: Event, index: number) {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      this.handleFileUpload(input.files[0], index);
    }
  }

  private handleFileUpload(file: File, index: number) {
    const invoice = this.invoices[index];
    invoice.type = 'file';
    invoice.file = file;
    invoice.status = 'pending';
    
    // In a real implementation, you might want to immediately check
    // how many invoices are in the file, but we'll wait until extraction
  }

  removeFile(index: number) {
    const invoice = this.invoices[index];
    invoice.type = null;
    invoice.file = null;
    invoice.status = 'pending';
    invoice.invoiceCount = undefined;
  }

  canExport(): boolean {
    return this.invoices.some(inv => inv.type === 'file' && inv.file);
  }

  // STEP 1: Detect language first
  detectLanguage() {
    const readyInvoices = this.invoices.filter(inv => inv.type === 'file' && inv.file);

    if (readyInvoices.length === 0) {
      alert('No complete invoices to process');
      return;
    }

    this.isProcessing = true;

    // Build FormData for language detection (send first invoice)
    const formData = new FormData();
    const invoice = readyInvoices[0];
    formData.append('file', invoice.file!);

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
    const readyInvoices = this.invoices.filter(inv => inv.type === 'file' && inv.file);
    
    if (readyInvoices.length === 0) {
      alert('No invoices to process');
      return;
    }

    this.isProcessing = true;

    // Build FormData - send all invoices
    const formData = new FormData();
    
    readyInvoices.forEach((invoice) => {
      formData.append('files', invoice.file!);
      invoice.status = 'processing'; // Set status to processing
    });

    if (targetLanguage && targetLanguage !== 'none') {
      formData.append('translate_to', targetLanguage);
      formData.append('translate_all', String(translateAllFields));
    }

    // Log what we're sending (for debugging)
    console.log('Sending extraction request:');
    console.log('- Files count:', readyInvoices.length);
    for (let pair of (formData as any).entries()) {
      if (pair[0] === 'files') {
        console.log(`- ${pair[0]}:`, pair[1] instanceof File ? pair[1].name : pair[1]);
      } else {
        console.log(`- ${pair[0]}:`, pair[1]);
      }
    }

    this.http.post(`${environment.apiUrl}/api/extract/invoice`, formData)
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

          readyInvoices.forEach(inv => inv.status = 'pending');
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

  // Add this new method to poll for batch completion
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
              
              // Update invoice statuses
              this.invoices.forEach(inv => {
                if (inv.status === 'processing') {
                  inv.status = 'completed';
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