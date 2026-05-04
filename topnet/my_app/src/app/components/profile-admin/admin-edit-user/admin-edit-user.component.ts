import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../services/auth.service';

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  manager_id: number | null;
  permissions: number[];
}

interface Permission {
  id: number;
  name: string;
  description: string;
}

@Component({
  selector: 'app-admin-edit-user',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-edit-user.component.html',
  styleUrls: ['./admin-edit-user.component.css']
})
export class AdminEditUserComponent implements OnInit {
  user: User | null = null;
  permissions: Permission[] = [];
  availableManagers: any[] = [];
  loading = false;
  error = '';
  successMessage = '';

  editData = {
    username: '',
    email: '',
    full_name: '',
    role: '',
    is_active: true,
    password: '',
    confirmPassword: '',
    permission_ids: [] as number[],
    manager_id: null as number | null
  };

  private apiUrl = 'http://localhost:8000/api/admin';

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
    this.loadPermissions();
    this.loadAvailableManagers();
    this.loadUser();
  }

  loadPermissions() {
    this.http.get<Permission[]>(`${this.apiUrl}/permissions`).subscribe({
      next: (data) => {
        this.permissions = data;
      },
      error: (err) => console.error('Error loading permissions:', err)
    });
  }

  loadAvailableManagers() {
    this.http.get<any[]>(`${this.apiUrl}/available-managers`).subscribe({
      next: (data) => {
        this.availableManagers = data;
      },
      error: (err) => console.error('Error loading managers:', err)
    });
  }

  loadUser() {
    this.loading = true;
    const userId = this.route.snapshot.paramMap.get('id');
    
    if (!userId) {
      this.error = 'No user ID provided';
      this.loading = false;
      return;
    }

    this.http.get<any>(`${this.apiUrl}/users/${userId}`).subscribe({
      next: (data) => {
        this.user = data;
        this.editData = {
          username: data.username,
          email: data.email,
          full_name: data.full_name || '',
          role: data.role,
          is_active: data.is_active,
          password: '',
          confirmPassword: '',
          permission_ids: data.permissions || [],
          manager_id: data.manager_id || null
        };
        this.loading = false;
      },
      error: (err) => {
        console.error('Error loading user:', err);
        this.error = 'Failed to load user';
        this.loading = false;
      }
    });
  }

  getPermissionIcon(permName: string): string {
    const icons: {[key: string]: string} = {
      'idcard': '🪪',
      'invoice': '📄',
      'contract': '📑',
      'passport': '🛂',
      'view_subordinates': '👥'
    };
    return icons[permName] || '✅';
  }

  togglePermission(permId: number) {
    const index = this.editData.permission_ids.indexOf(permId);
    if (index === -1) {
      this.editData.permission_ids.push(permId);
    } else {
      this.editData.permission_ids.splice(index, 1);
    }
  }

  isPermissionSelected(permId: number): boolean {
    return this.editData.permission_ids.includes(permId);
  }

  saveUser() {
    // Validation
    if (this.editData.password && this.editData.password !== this.editData.confirmPassword) {
      this.error = 'Passwords do not match';
      return;
    }

    if (this.editData.password && this.editData.password.length < 6) {
      this.error = 'Password must be at least 6 characters';
      return;
    }

    this.loading = true;
    this.error = '';
    this.successMessage = '';

    const updateData: any = {
      username: this.editData.username,
      email: this.editData.email,
      full_name: this.editData.full_name,
      role: this.editData.role,
      is_active: this.editData.is_active,
      permission_ids: this.editData.permission_ids,
      manager_id: this.editData.manager_id
    };

    if (this.editData.password) {
      updateData.password = this.editData.password;
    }
    
    this.http.put(`${this.apiUrl}/users/${this.user?.id}/full`, updateData).subscribe({
      next: () => {
        this.loading = false;
        this.successMessage = 'User updated successfully!';
        
        setTimeout(() => {
          this.router.navigate(['/admin/profile-management']);
        }, 1500);
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.detail || 'Failed to update user';
      }
    });
  }

  goBack() {
    this.router.navigate(['/admin/profile-management']);
  }
}