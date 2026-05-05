import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface Document {
  id: number;
  filename: string;
  status: string;
  created_at: string;
  owner_id: number;
  owner_name: string;
  batch_id: number;
}

interface Subordinate {
  id: number;
  username: string;
  full_name: string;
}

@Component({
  selector: 'app-manager-documents',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manager-documents.component.html',
  styleUrls: ['./manager-documents.component.css']
})
export class ManagerDocumentsComponent implements OnInit {
  documents: Document[] = [];
  subordinates: Subordinate[] = [];
  totalCount: number= 0;
  skip = 0;
  limit = 20;
  page = 1;
  totalPages = 1;
  loadingDocuments = true;
  loadingSubordinates = true;
  errorDocuments: string | null = null;
  errorSubordinates: string | null = null;

  filters = {
    userId: null as number | null,
    search: '',
    period: null as string | null,
    dateFrom: '',
    dateTo: ''
  };

  selectedDoc: Document | null = null;
  extractedFields: any[] = [];

  private apiUrl = `${environment.apiUrl}/api/manager`;

  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    console.log('🔵 ManagerDocumentsComponent initialized - API URL:', this.apiUrl);
    this.loadSubordinates();
    this.loadDocuments();
  }

  loadSubordinates() {
    this.loadingSubordinates = true;
    this.errorSubordinates = null;
    this.cdr.detectChanges();
    
    console.log('📡 Loading subordinates from:', `${this.apiUrl}/subordinates`);
    
    this.http.get<Subordinate[]>(`${this.apiUrl}/subordinates`).subscribe({
      next: (data) => {
        console.log('✅ Subordinates loaded:', data);
        this.subordinates = data;
        this.loadingSubordinates = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('❌ Error loading subordinates:', err);
        this.errorSubordinates = err.error?.detail || err.message || 'Failed to load team members';
        this.loadingSubordinates = false;
        this.cdr.detectChanges();
      }
    });
  }

  loadDocuments() {
    this.loadingDocuments = true;
    this.errorDocuments = null;
    this.cdr.detectChanges();
    
    let url = `${this.apiUrl}/documents?skip=${this.skip}&limit=${this.limit}`;
    
    if (this.filters.userId) url += `&user_id=${this.filters.userId}`;
    if (this.filters.search) url += `&search=${encodeURIComponent(this.filters.search)}`;
    if (this.filters.period && this.filters.period !== 'custom') {
      url += `&period=${this.filters.period}`;
    }
    if (this.filters.period === 'custom') {
      if (this.filters.dateFrom) url += `&date_from=${this.filters.dateFrom}`;
      if (this.filters.dateTo) url += `&date_to=${this.filters.dateTo}`;
    }

    console.log('📡 Loading documents from:', url);
    
    this.http.get<any>(url).subscribe({
      next: (response) => {
        console.log('✅ Documents loaded:', response);
        this.documents = response.documents;
        this.totalCount = response.total || 0;
        this.totalPages = Math.ceil(this.totalCount / this.limit);
        this.page = Math.floor(this.skip / this.limit) + 1;
        this.loadingDocuments = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('❌ Error loading documents:', err);
        this.errorDocuments = err.error?.detail || err.message || 'Failed to load documents';
        this.loadingDocuments = false;
        this.cdr.detectChanges();
      }
    });
  }

  applyFilters() {
    this.skip = 0;
    this.loadDocuments();
  }

  onPeriodChange() {
    if (this.filters.period !== 'custom') {
      this.filters.dateFrom = '';
      this.filters.dateTo = '';
      this.applyFilters();
    }
  }

  clearFilters() {
    this.filters = {
      userId: null,
      search: '',
      period: null,
      dateFrom: '',
      dateTo: ''
    };
    this.skip = 0;
    this.loadDocuments();
  }

  prevPage() {
    if (this.skip >= this.limit) {
      this.skip -= this.limit;
      this.loadDocuments();
    }
  }

  nextPage() {
    if (this.skip + this.limit < (this.totalCount || 0)) {
      this.skip += this.limit;
      this.loadDocuments();
    }
  }

  viewDocument(doc: Document) {
    this.http.get<any>(`${this.apiUrl}/documents/${doc.id}`).subscribe({
      next: (data) => {
        this.selectedDoc = doc;
        this.extractedFields = data.extracted_fields || [];
      },
      error: (err) => console.error('Error loading document details:', err)
    });
  }

  downloadDocument(doc: Document) {
    this.http.get(`${this.apiUrl}/documents/${doc.id}/download`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
      error: (err) => console.error('Download failed:', err)
    });
  }

  closeModal() {
    this.selectedDoc = null;
    this.extractedFields = [];
  }

  closeModalOnBackdrop(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal')) {
      this.closeModal();
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return 'N/A';
    }
  }
}