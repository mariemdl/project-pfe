import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  created_at: string;
  permissions: number[];
  manager_id?: number;
  subordinates?: any[];
}

interface Permission {
  id: number;
  name: string;
  description: string;
}

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-management.component.html',
  styleUrls: ['./user-management.component.css']
})
export class UserManagementComponent implements OnInit {
  users: User[] = [];
  permissions: Permission[] = [];
  availableManagers: any[] = [];
  statusFilter: 'all' | 'active' | 'inactive' = 'all';
  searchTerm: string = '';

  private apiUrl = `${environment.apiUrl}/api/admin`;

  constructor(
    private http: HttpClient,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadPermissions();
    this.loadUsers();
    this.loadAvailableManagers();
  }

  loadPermissions() {
    this.http.get<Permission[]>(`${this.apiUrl}/permissions`).subscribe({
      next: (data) => {
        this.permissions = data;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading permissions:', err);
        this.cdr.detectChanges();
      }
    });
  }

  loadUsers() {
    let url = `${this.apiUrl}/users?status=${this.statusFilter}`;
    if (this.searchTerm) url += `&search=${this.searchTerm}`;
    
    this.http.get<User[]>(url).subscribe({
      next: (data) => {
        this.users = data;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading users:', err);
        this.cdr.detectChanges();
      }
    });
  }

  loadAvailableManagers() {
    this.http.get<any[]>(`${this.apiUrl}/available-managers`).subscribe({
      next: (data) => {
        this.availableManagers = data;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading managers:', err);
        this.cdr.detectChanges();
      }
    });
  }

  getUserPermissions(permIds: number[]): string[] {
    return permIds.map(id => {
      const perm = this.permissions.find(p => p.id === id);
      return perm ? perm.name : '';
    }).filter(p => p);
  }

  getManagerName(managerId: number): string {
    const manager = this.availableManagers.find(m => m.id === managerId);
    return manager ? (manager.full_name || manager.username) : 'Unknown';
  }

  createProfile() {
    this.router.navigate(['/admin/create-user']);
  }

  editUser(user: User) {
    this.router.navigate(['/admin/edit-user', user.id]);
  }

  toggleStatus(user: User) {
    console.log('📡 Toggling status for user:', user.id);
    this.http.patch(`${this.apiUrl}/users/${user.id}/status`, {}).subscribe({
      next: () => {
        console.log('✅ Status toggled successfully');
        this.loadUsers();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('❌ Error toggling status:', err);
        alert(err.error?.detail || 'Failed to toggle status');
        this.cdr.detectChanges();
      }
    });
  }

  deleteUser(user: User) {
    if (confirm(`Delete user "${user.username}"? This cannot be undone.`)) {
      console.log('📡 Deleting user:', user.id);
      this.http.delete(`${this.apiUrl}/users/${user.id}`).subscribe({
        next: () => {
          console.log('✅ User deleted successfully');
          this.loadUsers();
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('❌ Error deleting user:', err);
          alert(err.error?.detail || 'Failed to delete user');
          this.cdr.detectChanges();
        }
      });
    }
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

  onStatusFilterChange() {
    this.loadUsers();
    this.cdr.detectChanges();
  }

  onSearchChange() {
    this.loadUsers();
    this.cdr.detectChanges();
  }
}