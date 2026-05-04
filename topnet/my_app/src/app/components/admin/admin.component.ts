import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { AuthService } from '../../services/auth.service';

interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  manager_id: number | null;
  is_active: boolean;
  created_at: string;
  last_login?: string;
  subordinate_count: number;
  inactive_days?: number;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {
  users: User[] = [];
  filteredUsers: User[] = [];
  loading = true;
  searchTerm = '';
  selectedUser: User | null = null;
  showEditModal = false;
  showDeleteConfirm = false;
  showActivateConfirm = false;
  error = '';
  successMessage = '';
  updateLoading = false;

  editForm = {
    full_name: '' as string,
    email: '' as string,
    role: '' as string,
    is_active: true as boolean,
    manager_id: null as number | null
  };

  roleOptions = [
    { value: 'admin', label: 'Admin', description: 'Full system access' },
    { value: 'manager', label: 'Manager', description: 'View team + own data' },
    { value: 'operator', label: 'Operator', description: 'Create and view documents' },
    { value: 'viewer', label: 'Viewer', description: 'Read-only access' }
  ];

  constructor(private router: Router, private authService: AuthService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    if (!this.authService.isAdmin()) {
      this.router.navigate(['/home']);
      return;
    }
    this.loadUsers();
  }

  loadUsers() {
    this.loading = true;
    this.cdr.detectChanges();

    const token = this.authService.getToken();
    fetch(`${environment.apiUrl}/api/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        this.users = data.map((user: User) => ({
          ...user,
          inactive_days: this.calculateInactiveDays(user.created_at)
        }));
        this.filteredUsers = [...this.users];
        this.loading = false;
        this.cdr.detectChanges();
      })
      .catch(err => {
        console.error('Error loading users:', err);
        this.error = 'Failed to load users';
        this.loading = false;
        this.cdr.detectChanges();
      });
  }

  calculateInactiveDays(createdAt: string): number {
    const created = new Date(createdAt);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - created.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  filterUsers() {
    if (!this.searchTerm) {
      this.filteredUsers = [...this.users];
    } else {
      const term = this.searchTerm.toLowerCase();
      this.filteredUsers = this.users.filter(user =>
        user.username.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        (user.full_name && user.full_name.toLowerCase().includes(term))
      );
    }
    this.cdr.detectChanges();
  }

  editUser(user: User) {
    this.selectedUser = { ...user };
    this.editForm = {
      full_name: user.full_name || '',
      email: user.email,
      role: user.role,
      is_active: user.is_active,
      manager_id: user.manager_id
    };
    this.showEditModal = true;
    this.error = '';
    this.successMessage = '';
    this.cdr.detectChanges();
  }

  saveUser() {
    if (!this.selectedUser) return;

    this.updateLoading = true;
    this.error = '';
    this.successMessage = '';
    this.cdr.detectChanges();

    const updateData = {
      full_name: this.editForm.full_name,
      email: this.editForm.email,
      role: this.editForm.role,
      is_active: this.editForm.is_active,
      manager_id: this.editForm.manager_id
    };

    const token = this.authService.getToken();
    fetch(`${environment.apiUrl}/api/users/${this.selectedUser.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updateData)
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(() => {
        this.updateLoading = false;
        this.successMessage = 'User updated successfully!';
        this.cdr.detectChanges();
        this.loadUsers();
        setTimeout(() => {
          this.showEditModal = false;
          this.successMessage = '';
          this.cdr.detectChanges();
        }, 1500);
      })
      .catch(err => {
        this.updateLoading = false;
        this.error = err.message || 'Failed to update user';
        this.cdr.detectChanges();
      });
  }

  confirmActivate(user: User) {
    this.selectedUser = user;
    this.showActivateConfirm = true;
    this.cdr.detectChanges();
  }

  toggleUserStatus() {
    if (!this.selectedUser) return;

    const newStatus = !this.selectedUser.is_active;
    const updateData = { is_active: newStatus };
    const token = this.authService.getToken();

    fetch(`${environment.apiUrl}/api/users/${this.selectedUser.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updateData)
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(() => {
        this.loadUsers();
        this.showActivateConfirm = false;
        this.successMessage = `User ${newStatus ? 'activated' : 'deactivated'} successfully!`;
        this.cdr.detectChanges();
        setTimeout(() => this.successMessage = '', 3000);
      })
      .catch(err => {
        this.error = err.message || 'Failed to update user status';
        this.cdr.detectChanges();
        setTimeout(() => this.error = '', 3000);
      });
  }

  confirmDelete(user: User) {
    this.selectedUser = user;
    this.showDeleteConfirm = true;
    this.cdr.detectChanges();
  }

  deleteUser() {
    if (!this.selectedUser) return;

    const token = this.authService.getToken();
    fetch(`${environment.apiUrl}/api/users/${this.selectedUser.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        this.loadUsers();
        this.showDeleteConfirm = false;
        this.successMessage = 'User deleted successfully!';
        this.cdr.detectChanges();
        setTimeout(() => this.successMessage = '', 3000);
      })
      .catch(err => {
        this.error = err.message || 'Failed to delete user';
        this.cdr.detectChanges();
        setTimeout(() => this.error = '', 3000);
      });
  }

  closeModal() {
    this.showEditModal = false;
    this.showDeleteConfirm = false;
    this.showActivateConfirm = false;
    this.selectedUser = null;
    this.error = '';
    this.successMessage = '';
    this.cdr.detectChanges();
  }

  getRoleBadgeClass(role: string): string {
    switch(role) {
      case 'admin': return 'badge-admin';
      case 'manager': return 'badge-manager';
      case 'operator': return 'badge-operator';
      default: return 'badge-viewer';
    }
  }

  getRoleDescription(role: string): string {
    const option = this.roleOptions.find(r => r.value === role);
    return option?.description || '';
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}