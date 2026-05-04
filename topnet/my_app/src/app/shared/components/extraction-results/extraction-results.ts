import { Component, OnInit, AfterViewInit, QueryList, ViewChildren, ElementRef, Renderer2, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { ExtractionBatch, ExtractedDocument, ExtractedField } from '../../../models/extraction.models';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../../services/auth.service';
import { TranslationService } from '../../../services/translation.service';
import { TranslationDialogComponent, TranslationDialogData, TranslationDialogResult } from '../translation-dialog/translation-dialog';

@Component({
  selector: 'app-extraction-results',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './extraction-results.html',
  styleUrls: ['./extraction-results.css']
})
export class ExtractionResultsComponent implements OnInit, AfterViewInit {
  batch: ExtractionBatch | null = null;
  loading = true;
  error: string | null = null;
  
  documentsWithAddress: Array<{batchId: number, documentIndex: number, cardIndex: number}> = [];
  private mapsLoaded = false;
  private loadingMaps = false;
  
  // Translation properties
  isTranslating = false;
  targetLanguage: string = '';
  sourceLanguage: string = '';
  
  // Auto-translation property
  autoTranslateLanguage: string | null = null;

  @ViewChildren('mapContainer', { read: ElementRef }) mapContainers!: QueryList<ElementRef>;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private sanitizer: DomSanitizer,
    private renderer: Renderer2,
    private cdr: ChangeDetectorRef,
    private authService: AuthService,
    private translationService: TranslationService,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    const batchId = this.route.snapshot.paramMap.get('id');
    console.log('Loading results for batch:', batchId);
    
    // Check navigation state for auto-translation
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras?.state as any;
    if (state?.targetLanguage && state?.targetLanguage !== 'none') {
      this.autoTranslateLanguage = state.targetLanguage;
      console.log('Auto-translate requested to:', this.autoTranslateLanguage);
    }
    
    if (batchId) {
      this.loadResults(+batchId);
      this.checkForTranslationOption();
    } else {
      this.error = 'No batch ID provided';
      this.loading = false;
    }
  }

  ngAfterViewInit() {
    console.log('ngAfterViewInit - Map containers count:', this.mapContainers.length);
    
    this.mapContainers.changes.subscribe((containers: QueryList<ElementRef>) => {
      console.log('Map containers changed - new count:', containers.length);
      if (this.documentsWithAddress.length > 0 && containers.length > 0 && !this.mapsLoaded && !this.loadingMaps) {
        console.log('Loading maps after container change');
        this.loadMaps();
      }
    });
  }

  checkForTranslationOption() {
    // Check if translation was requested during extraction
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras?.state as any;
    
    // Store the auto-translate language if present
    if (state?.targetLanguage && state?.targetLanguage !== 'none') {
      this.autoTranslateLanguage = state.targetLanguage;
      console.log('Auto-translation detected:', this.autoTranslateLanguage);
    }
  }

  loadResults(batchId: number) {
    this.loading = true;
    this.mapsLoaded = false;
    this.loadingMaps = false;

    setTimeout(() => {
      if (this.loading) {
        this.loading = false;
        this.error = 'Request timed out. Please try again.';
      }
    }, 10000);

    const token = this.authService.getToken();
  
    this.http.get(`${environment.apiUrl}/api/batch/${batchId}/results`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .subscribe({
      next: async (data: any) => {
        // ========== FORCE DETAILED LOGGING ==========
        console.log('=== FULL RESPONSE DATA ===');
        console.log(JSON.stringify(data, null, 2));
      
        console.log('=== RESPONSE KEYS ===');
        console.log(Object.keys(data));
      
        if (data.documents && data.documents.length > 0) {
          console.log('=== FIRST DOCUMENT KEYS ===');
          console.log(Object.keys(data.documents[0]));
        
          console.log('=== FIRST DOCUMENT FULL CONTENT ===');
          console.log(JSON.stringify(data.documents[0], null, 2));
        
          if (data.documents[0].fields) {
            console.log('=== FIELDS ARRAY ===');
            console.log(data.documents[0].fields);
          }
        
          if (data.documents[0].extracted_text) {
            console.log('=== EXTRACTED TEXT ===');
            console.log(data.documents[0].extracted_text);
          }
        
          for (const key in data.documents[0]) {
            if (key !== 'fields' && key !== 'extracted_text' && typeof data.documents[0][key] !== 'function') {
              console.log(`=== PROPERTY: ${key} ===`);
              console.log(data.documents[0][key]);
            }
          }
        }
        // ========== END DEBUG ==========
      
        // Transform the data if it has extracted_text but no proper fields
        if (data && data.documents) {
          data.documents = data.documents.map((doc: any) => {
            if (doc.extracted_text && (!doc.fields || doc.fields.length === 0)) {
              console.log('Parsing extracted_text for document:', doc.sequence_number);
              doc.fields = this.parseExtractedTextToFields(doc.extracted_text);
            }
            return doc;
          });
        }
      
        this.batch = data;
      
        // Detect source language from extracted fields
        this.detectSourceLanguage();
        
        // Auto-translation if language was selected
        if (this.autoTranslateLanguage && this.autoTranslateLanguage !== 'none') {
          const targetLang = this.autoTranslateLanguage;
          
          // Only translate if target is different from source
          if (targetLang.toLowerCase() !== this.sourceLanguage.toLowerCase()) {
            console.log(`🔄 Auto-translating to ${targetLang}...`);
            await this.autoTranslateAllDocuments(targetLang);
          } else {
            console.log(`Source and target language are the same (${this.sourceLanguage}), skipping translation`);
            this.targetLanguage = targetLang;
          }
        }
      
        this.documentsWithAddress = [];

        if (this.batch && this.batch.documents) {
          console.log('Documents found:', this.batch.documents.length);
          this.batch.documents.forEach((doc: any, index: number) => {
            if (this.hasAddress(doc)) {
              console.log(`Document ${index} has address`);
              this.documentsWithAddress.push({
                batchId: this.batch!.batch_id,
                documentIndex: doc['sequence_number'],
                cardIndex: index
              });
            }
          });
        }
      
        this.loading = false;
        this.cdr.detectChanges();
      
        setTimeout(() => {
          console.log('Attempting to load maps after data load...');
          if (this.mapContainers && this.mapContainers.length > 0 && !this.mapsLoaded && !this.loadingMaps) {
            this.loadMaps();
          }
        }, 500);
      },
      error: (err) => {
        console.error('Error loading results:', err);
        this.error = 'Failed to load results';
        this.loading = false;
      }
    });
  }

  private debugApiResponse(data: any) {
    console.log('========== DEBUG: FULL API RESPONSE ==========');
    console.log('Complete response object:', JSON.stringify(data, null, 2));
  
    if (data && data.documents) {
      data.documents.forEach((doc: any, idx: number) => {
        console.log(`\n========== DOCUMENT ${idx} ==========`);
        console.log('All keys in document:', Object.keys(doc));
        console.log('Document fields array:', doc.fields);
        console.log('Document extracted_text:', doc.extracted_text);
        console.log('Document raw response:', doc);
      
        if (doc.fields && doc.fields.length > 0) {
          console.log('Fields found:', doc.fields.map((f: any) => f.name));
        } else {
          console.log('NO FIELDS ARRAY FOUND!');
        }
      
        for (const key in doc) {
          if (key !== 'fields' && key !== 'extracted_text' && typeof doc[key] !== 'function') {
            console.log(`Additional property '${key}':`, doc[key]);
          }
        }
      });
    }
  
    console.log('========== END DEBUG ==========');
  }

  private parseExtractedTextToFields(extractedText: string): ExtractedField[] {
    const fields: ExtractedField[] = [];
    
    if (!extractedText) {
      return fields;
    }
    
    const lines = extractedText.split('\n');
    
    const patterns = [
      { name: 'full_name', patterns: [/name[:\s]+(.+)/i, /full name[:\s]+(.+)/i, /nom[:\s]+(.+)/i] },
      { name: 'id_number', patterns: [/id[:\s]+([A-Z0-9]+)/i, /identity[:\s]+([A-Z0-9]+)/i, /number[:\s]+([A-Z0-9]+)/i, /id card[:\s]+([A-Z0-9]+)/i] },
      { name: 'date_of_birth', patterns: [/birth[:\s]+(.+)/i, /dob[:\s]+(.+)/i, /born[:\s]+(.+)/i, /date of birth[:\s]+(.+)/i, /naissance[:\s]+(.+)/i] },
      { name: 'nationality', patterns: [/nationality[:\s]+(.+)/i, /citizenship[:\s]+(.+)/i, /nationalité[:\s]+(.+)/i] },
      { name: 'address', patterns: [/address[:\s]+(.+)/i, /residence[:\s]+(.+)/i, /adresse[:\s]+(.+)/i] },
      { name: 'gender', patterns: [/gender[:\s]+(.+)/i, /sex[:\s]+(.+)/i, /sexe[:\s]+(.+)/i] },
      { name: 'expiry_date', patterns: [/expiry[:\s]+(.+)/i, /valid until[:\s]+(.+)/i, /expiration[:\s]+(.+)/i, /valid till[:\s]+(.+)/i] }
    ];
    
    for (const line of lines) {
      for (const pattern of patterns) {
        for (const regex of pattern.patterns) {
          const match = line.match(regex);
          if (match && match[1] && !fields.find(f => f.name === pattern.name)) {
            fields.push({
              name: pattern.name,
              value: match[1].trim(),
              confidence: 0.95
            });
            break;
          }
        }
      }
    }
    
    if (fields.length === 0) {
      for (const line of lines) {
        if (line.includes(':') && !line.toLowerCase().includes('confidence')) {
          const parts = line.split(':');
          if (parts.length >= 2) {
            const fieldName = parts[0].trim().toLowerCase().replace(/[^a-z_]/g, '_');
            const fieldValue = parts.slice(1).join(':').trim();
            if (fieldValue && fieldValue.length > 0 && fieldValue.length < 200 && fieldName.length > 0 && fieldName.length < 50) {
              fields.push({
                name: fieldName,
                value: fieldValue,
                confidence: 0.85
              });
            }
          }
        }
      }
    }
    
    const confidenceMatch = extractedText.match(/confidence[:\s]+(\d+)%/i);
    if (confidenceMatch && confidenceMatch[1]) {
      fields.push({
        name: 'ocr_confidence',
        value: `${confidenceMatch[1]}%`,
        confidence: 1.0
      });
    }
    
    console.log('Parsed fields from extracted_text:', fields);
    return fields;
  }

  formatFieldName(fieldName: string): string {
    const displayNames: Record<string, string> = {
      'full_name': 'Full Name',
      'id_number': 'ID Number',
      'date_of_birth': 'Date of Birth',
      'nationality': 'Nationality',
      'address': 'Address',
      'gender': 'Gender',
      'expiry_date': 'Expiry Date',
      'ocr_confidence': 'OCR Confidence',
      'document_number': 'Document Number',
      'issue_date': 'Issue Date',
      'place_of_birth': 'Place of Birth'
    };
    
    if (displayNames[fieldName]) {
      return displayNames[fieldName];
    }
    
    return fieldName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  detectSourceLanguage() {
    if (!this.batch || !this.batch.documents) return;
    
    const allText = this.batch.documents
      .flatMap(doc => doc.fields || [])
      .map(field => field.value)
      .join(' ');
    
    if (/[\u0600-\u06FF]/.test(allText)) {
      this.sourceLanguage = 'arabic';
    } else if (/[éèêëàâçîïôûùüÿ]/i.test(allText)) {
      this.sourceLanguage = 'french';
    } else {
      this.sourceLanguage = 'english';
    }
    
    console.log(`Source language detected: ${this.sourceLanguage}`);
  }

  async autoTranslateAllDocuments(targetLanguage: string) {
    if (!this.batch || !this.batch.documents) return;
    
    this.isTranslating = true;
    
    try {
      for (const doc of this.batch.documents) {
        if (doc.fields && doc.fields.length > 0) {
          const translatedFields = await this.translationService.translateFields(
            doc.fields,
            targetLanguage,
            this.sourceLanguage
          );
          doc.translated_fields = translatedFields;
        }
      }
      
      this.targetLanguage = targetLanguage;
      this.cdr.detectChanges();
      console.log(`✅ Auto-translation to ${targetLanguage} completed`);
      
    } catch (error) {
      console.error('Auto-translation failed:', error);
    } finally {
      this.isTranslating = false;
    }
  }

  showTranslationDialog() {
    const dialogData: TranslationDialogData = {
      originalLanguage: this.sourceLanguage,
      languages: ['english', 'french', 'arabic', 'german', 'spanish']
    };

    const dialogRef = this.dialog.open(TranslationDialogComponent, {
      width: '450px',
      data: dialogData
    });

    dialogRef.afterClosed().subscribe((result: TranslationDialogResult) => {
      if (result && result.language !== 'none') {
        this.targetLanguage = result.language;
        this.applyTranslation(result.language);
      }
    });
  }

  async applyTranslation(targetLanguage: string) {
    if (!this.batch || !this.batch.documents) return;
    
    if (targetLanguage.toLowerCase() === this.sourceLanguage.toLowerCase()) {
      alert(`⚠️ Target language (${targetLanguage}) is the same as the source language. No translation needed.`);
      return;
    }
    
    this.isTranslating = true;
    
    try {
      for (const doc of this.batch.documents) {
        if (doc.fields && doc.fields.length > 0) {
          const translatedFields = await this.translationService.translateFields(
            doc.fields,
            targetLanguage,
            this.sourceLanguage
          );
          doc.translated_fields = translatedFields;
        }
      }
      
      this.targetLanguage = targetLanguage;
      this.cdr.detectChanges();
      console.log(`✅ Translation to ${targetLanguage} completed`);
      
    } catch (error) {
      console.error('Translation failed:', error);
      alert('Translation failed. Please try again.');
    } finally {
      this.isTranslating = false;
    }
  }

  private loadMaps() {
    if (this.mapsLoaded || this.loadingMaps) {
      console.log('Maps already loaded or loading, skipping');
      return;
    }

    if (!this.mapContainers || this.mapContainers.length === 0) {
      console.warn('No map containers available');
      return;
    }

    if (this.documentsWithAddress.length === 0) {
      console.log('No documents with addresses to load maps for');
      return;
    }

    this.loadingMaps = true;
    console.log(`Loading ${this.documentsWithAddress.length} maps with ${this.mapContainers.length} containers`);
    
    const containers = this.mapContainers.toArray();
    this.loadMapSequentially(0, containers);
  }

  private loadMapSequentially(index: number, containers: ElementRef[]) {
    if (index >= this.documentsWithAddress.length) {
      console.log('✅ All maps loaded successfully');
      this.mapsLoaded = true;
      this.loadingMaps = false;
      return;
    }

    const item = this.documentsWithAddress[index];
    if (index < containers.length) {
      const container = containers[index];
      console.log(`Loading map for document ${item.cardIndex} (${index + 1}/${this.documentsWithAddress.length})`);
      
      this.loadMapIntoContainer(item.batchId, item.documentIndex, container.nativeElement)
        .then(() => {
          setTimeout(() => this.loadMapSequentially(index + 1, containers), 100);
        })
        .catch(error => {
          console.error(`Failed to load map for document ${item.cardIndex}:`, error);
          setTimeout(() => this.loadMapSequentially(index + 1, containers), 100);
        });
    } else {
      this.loadMapSequentially(index + 1, containers);
    }
  }

  getDocumentIcon(documentType: string): string {
    const icons: Record<string, string> = {
      'id-card': '🆔',
      'invoice': '📄',
      'passport': '🛂',
      'contract': '📝'
    };
    return icons[documentType] || '📄';
  }

  getDocumentTitle(documentType: string): string {
    const titles: Record<string, string> = {
      'id-card': 'ID Card',
      'invoice': 'Invoice',
      'passport': 'Passport',
      'contract': 'Contract'
    };
    return titles[documentType] || 'Document';
  }

  hasAddress(doc: any): boolean {
    return doc.fields?.some((field: any) => 
      field.name.toLowerCase().includes('address')
    );
  }

  getAddressField(doc: any): string {
    const addressField = doc.fields?.find((field: any) => 
      field.name.toLowerCase().includes('address')
    );
    return addressField ? addressField.value : '';
  }

  loadMapIntoContainer(batchId: number, documentIndex: number, container: HTMLElement): Promise<void> {
    console.log(`🔍 Loading map for batch ${batchId}, document ${documentIndex}`);
    
    const token = this.authService.getToken();
    const url = `${environment.apiUrl}/api/map/${batchId}/${documentIndex}`;
    console.log('📡 Map URL:', url);

    container.innerHTML = '<div class="map-loading"><div class="spinner-small"></div><p>Loading map...</p></div>';

    return fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(response => {
        console.log('📥 Map response status:', response.status);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();
      })
      .then(html => {
        console.log('📄 Map HTML received, length:', html.length);
        container.innerHTML = '';
        container.innerHTML = html;
        console.log('✅ Map loaded successfully!');
        return Promise.resolve();
      })
      .catch(error => {
        console.error('❌ Error loading map:', error);
        container.innerHTML = `<div class="map-error">Error loading map: ${error.message}</div>`;
        return Promise.reject(error);
      });
  }

  /*onDownloadPdf() {
    if (this.batch) {
      const token = this.authService.getToken();
      const url = `${environment.apiUrl}/api/batch/${this.batch.batch_id}/pdf`;
      
      console.log('Downloading PDF for batch:', this.batch.batch_id);
      
      fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`Download failed: ${response.status}`);
        }
        return response.blob();
      })
      .then(blob => {
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `batch_${this.batch!.batch_id}_report.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        console.log('PDF downloaded successfully');
      })
      .catch(error => {
        console.error('Download error:', error);
        alert('Failed to download PDF. Please make sure you are logged in and have permission to access this batch.');
      });
    }
  }*/
  async onDownloadPdf() {
    if (!this.batch) return;
    
    const token = this.authService.getToken();
    
    // Prepare the complete data with translations
    const pdfData = {
        batch_id: this.batch.batch_id,
        document_type: this.batch.document_type,
        target_language: this.targetLanguage || null,
        source_language: this.sourceLanguage,
        documents: this.batch.documents.map(doc => ({
            sequence_number: doc.sequence_number,
            fields: doc.fields.map(f => ({
                name: f.name,
                value: f.value,
                confidence: f.confidence
            })),
            translated_fields: doc.translated_fields ? doc.translated_fields.map(tf => ({
                name: tf.name,
                value: tf.value
            })) : null
        }))
    };
    
    console.log('Sending PDF request with translations:', pdfData);
    
    try {
        const response = await fetch(`${environment.apiUrl}/api/batch/${this.batch.batch_id}/pdf`, {
            method: 'POST',  // Use POST to send data
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(pdfData)
        });
        
        if (!response.ok) {
            throw new Error(`Download failed: ${response.status}`);
        }
        
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `batch_${this.batch.batch_id}_report.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        console.log('✅ PDF downloaded successfully with translations');
        
    } catch (error) {
        console.error('Download error:', error);
        alert('Failed to download PDF. Please try again.');
    }
  }

  onNewExtraction() {
    this.router.navigate(['/extraction/id-card']);
  }

  onRetry() {
    if (this.batch) {
      this.loadResults(this.batch.batch_id);
    } else {
      this.onNewExtraction();
    }
  }

  trackByIndex(index: number, item: any): number {
    return item.sequence_number || index;
  }
}