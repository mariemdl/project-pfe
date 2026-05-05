import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';
import { environment } from '../../../environments/environment';

interface Subordinate {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
}

@Component({
  selector: 'app-subordinates-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './subordinates-list.component.html',
  styleUrls: ['./subordinates-list.component.css']
})
export class SubordinatesListComponent implements OnInit {
  subordinates: Subordinate[] = [];
  loading = true;
  error: string | null = null;
  private apiUrl = `${environment.apiUrl}/api/manager`;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    console.log('🔵 SubordinatesListComponent initialized - API URL:', this.apiUrl);
    this.loadSubordinates();
  }

  loadSubordinates() {
    this.loading = true;
    this.error = null;
    this.subordinates = [];
    this.cdr.detectChanges();
    
    console.log('📡 Loading subordinates from:', `${this.apiUrl}/subordinates`);
    
    this.http.get<Subordinate[]>(`${this.apiUrl}/subordinates`).subscribe({
      next: (data) => {
        console.log('✅ Subordinates loaded successfully:', data);
        this.subordinates = data;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('❌ Error loading subordinates:', err);
        this.error = err.error?.detail || err.message || 'Failed to load subordinates';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'N/A';
    }
  }
}