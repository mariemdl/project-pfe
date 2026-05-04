import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

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
  imports: [CommonModule, FormsModule, HttpClientModule],
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

  filters = {
    userId: null as number | null,
    search: '',
    period: null as string | null,
    dateFrom: '',
    dateTo: ''
  };

  selectedDoc: Document | null = null;
  extractedFields: any[] = [];

  private apiUrl = 'http://localhost:8000/api/manager';

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadSubordinates();
    this.loadDocuments();
  }

  loadSubordinates() {
    this.http.get<Subordinate[]>(`${this.apiUrl}/subordinates`).subscribe({
      next: (data) => {
        this.subordinates = data;
      },
      error: (err) => console.error('Error loading subordinates:', err)
    });
  }

  loadDocuments() {
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

    this.http.get<any>(url).subscribe({
      next: (response) => {
        this.documents = response.documents;
        this.totalCount = response.total || 0;
        this.totalPages = Math.ceil(this.totalCount / this.limit);
        this.page = Math.floor(this.skip / this.limit) + 1;
      },
      error: (err) => console.error('Error loading documents:', err)
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
    window.open(`${this.apiUrl}/documents/${doc.id}/download`, '_blank');
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
    return new Date(dateString).toLocaleString();
  }
}