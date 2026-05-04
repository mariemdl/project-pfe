import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { FileSizePipe } from '../../shared/pipes/file-size-pipe';
import { TranslationDialogComponent, TranslationDialogData, TranslationDialogResult } from '../../shared/components/translation-dialog/translation-dialog';
import { environment } from '../../environments/environment';

export interface ContractDocument {
  type: 'file' | null;
  file?: File | null;
  status?: 'pending' | 'processing' | 'completed';
  sectionCount?: number;  // Number of sections/clauses detected
}

@Component({
  selector: 'app-contract-extraction',
  standalone: true,
  imports: [CommonModule, FileSizePipe],
  templateUrl: './contract-extraction.html',
  styleUrls: ['./contract-extraction.css']
})
export class ContractExtractionComponent implements OnDestroy {
  contracts: ContractDocument[] = [this.createEmptyContract()];
  activeDragIndex: number | null = null;
  isProcessing = false;  // Loading state

  // Polling
  private pollInterval: any = null;
  private pollTimeout: any = null;

  constructor(
    private http: HttpClient,
    private dialog: MatDialog,
    private router: Router
  ) {}

  createEmptyContract(): ContractDocument {
    return { type: null, status: 'pending' };
  }

  addContract() {
    this.contracts.push(this.createEmptyContract());
  }

  removeContract(index: number) {
    this.contracts.splice(index, 1);
    if (this.contracts.length === 0) this.addContract();
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
    const contract = this.contracts[index];
    contract.type = 'file';
    contract.file = file;
    contract.status = 'pending';
    
    // In a real implementation, you might want to immediately check
    // how many sections are in the contract, but we'll wait until extraction
  }

  removeFile(index: number) {
    const contract = this.contracts[index];
    contract.type = null;
    contract.file = null;
    contract.status = 'pending';
    contract.sectionCount = undefined;
  }

  canExport(): boolean {
    return this.contracts.some(con => con.type === 'file' && con.file);
  }

  // STEP 1: Detect language first
  detectLanguage() {
    const readyContracts = this.contracts.filter(con => con.type === 'file' && con.file);

    if (readyContracts.length === 0) {
      alert('No complete contracts to process');
      return;
    }

    this.isProcessing = true;

    // Build FormData for language detection (send first contract)
    const formData = new FormData();
    const contract = readyContracts[0];
    formData.append('file', contract.file!);

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
    const readyContracts = this.contracts.filter(con => con.type === 'file' && con.file);
    
    if (readyContracts.length === 0) {
      alert('No contracts to process');
      return;
    }

    this.isProcessing = true;

    // Build FormData - send all contracts with the correct field name 'files'
    const formData = new FormData();
    
    // IMPORTANT: Use 'files' as the parameter name (plural!) as required by the API
    readyContracts.forEach((contract) => {
      formData.append('files', contract.file!);
      contract.status = 'processing'; // Set status to processing
    });

    // Add translation parameters if needed
    if (targetLanguage && targetLanguage !== 'none') {
      formData.append('translate_to', targetLanguage);
      formData.append('translate_all', String(translateAllFields));
    }

    // Log what we're sending (for debugging)
    console.log('Sending contract extraction request:');
    console.log('- Files count:', readyContracts.length);
    for (let pair of (formData as any).entries()) {
      if (pair[0] === 'files') {
        console.log(`- ${pair[0]}:`, pair[1] instanceof File ? pair[1].name : pair[1]);
      } else {
        console.log(`- ${pair[0]}:`, pair[1]);
      }
    }

    this.http.post(`${environment.apiUrl}/api/extract/contract`, formData)
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
          
          readyContracts.forEach(con => con.status = 'pending');
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
              
              // Update contract statuses
              this.contracts.forEach(con => {
                if (con.status === 'processing') {
                  con.status = 'completed';
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