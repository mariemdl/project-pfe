import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';

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
  imports: [CommonModule, HttpClientModule],
  templateUrl: './subordinates-list.component.html',
  styleUrls: ['./subordinates-list.component.css']
})
export class SubordinatesListComponent implements OnInit {
  subordinates: Subordinate[] = [];
  private apiUrl = 'http://localhost:8000/api/manager';

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.loadSubordinates();
  }

  loadSubordinates() {
    this.http.get<Subordinate[]>(`${this.apiUrl}/subordinates`).subscribe({
      next: (data) => {
        this.subordinates = data;
      },
      error: (err) => {
        console.error('Error loading subordinates:', err);
      }
    });
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  }
}