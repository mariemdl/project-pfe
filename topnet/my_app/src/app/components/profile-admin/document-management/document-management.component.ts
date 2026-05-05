import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface Document {
  id: number;
  filename: string;
  status: string;
  owner: string;
  created_at: string;
}

@Component({
  selector: 'app-document-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './document-management.component.html',
  styleUrls: ['./document-management.component.css']
})
export class DocumentManagementComponent implements OnInit {
  documents: Document[] = [];
  statusFilter: string = '';

  private apiUrl = 'http://localhost:8000/api/admin';

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadDocuments();
  }

  loadDocuments() {
    let url = `${this.apiUrl}/documents`;
    if (this.statusFilter) url += `?status=${this.statusFilter}`;
    
    this.http.get<Document[]>(url).subscribe({
      next: (data) => {
        this.documents = data;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading documents:', err);
        this.cdr.detectChanges();
      }
    });
  }

  updateStatus(doc: Document) {
    this.http.patch(`${this.apiUrl}/documents/${doc.id}/status`, { status: doc.status }).subscribe({
      next: () => {
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error updating status:', err);
        this.cdr.detectChanges();
      }
    });
  }

  viewDocument(doc: Document) {
    window.open(`${this.apiUrl}/documents/${doc.id}/view`, '_blank');
  }

  deleteDocument(doc: Document) {
    if (confirm(`Delete document "${doc.filename}"?`)) {
      this.http.delete(`${this.apiUrl}/documents/${doc.id}`).subscribe({
        next: () => {
          this.loadDocuments();
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error deleting document:', err);
          this.cdr.detectChanges();
        }
      });
    }
  }

  onStatusFilterChange() {
    this.loadDocuments();
    this.cdr.detectChanges();
  }
}