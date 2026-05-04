import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, User } from '../../services/auth.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {
  user: User | null = null;
  loading = true;
  isEditing = false;
  updateLoading = false;
  error = '';
  successMessage = '';
  isAdminViewingOther = false;  // Track if admin is viewing another user

  showPasswordForm = false;
  passwordForm = {
    old_password: '',
    new_password: '',
    confirm_password: ''
  };
  passwordLoading = false;
  passwordError = '';
  passwordSuccess = '';

  editForm = {
    full_name: '',
    email: ''
  };

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // Check if there's an ID parameter (admin editing another user)
    const userId = this.route.snapshot.paramMap.get('id');
    if (userId && userId !== this.authService.getCurrentUser()?.id?.toString()) {
      this.isAdminViewingOther = true;
      this.loadUserById(parseInt(userId));
    } else {
      this.loadUserProfile();
    }
  }

  loadUserProfile() {
    this.loading = true;
    const token = this.authService.getToken();
    fetch(`${environment.apiUrl}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => {
      if (!response.ok) throw new Error('Not authenticated');
      return response.json();
    })
    .then(user => {
      this.user = user;
      this.editForm.full_name = user.full_name || '';
      this.editForm.email = user.email || '';
      this.loading = false;
      this.cdr.detectChanges();
    })
    .catch(err => {
      console.error('Error loading profile:', err);
      this.loading = false;
      this.error = 'Failed to load profile';
      this.cdr.detectChanges();
      this.router.navigate(['/login']);
    });
  }

  loadUserById(userId: number) {
    this.loading = true;
    const token = this.authService.getToken();
    fetch(`${environment.apiUrl}/api/admin/users/${userId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    .then(response => {
      if (!response.ok) throw new Error('User not found');
      return response.json();
    })
    .then(user => {
      this.user = user;
      this.editForm.full_name = user.full_name || '';
      this.editForm.email = user.email || '';
      this.loading = false;
      this.cdr.detectChanges();
    })
    .catch(err => {
      console.error('Error loading user:', err);
      this.loading = false;
      this.error = 'Failed to load user';
      this.cdr.detectChanges();
      this.router.navigate(['/admin/profile-management']);
    });
  }

  toggleEdit() {
    if (this.isEditing) {
      this.editForm.full_name = this.user?.full_name || '';
      this.editForm.email = this.user?.email || '';
      this.error = '';
      this.successMessage = '';
    }
    this.isEditing = !this.isEditing;
    this.cdr.detectChanges();
  }

  updateProfile() {
    this.updateLoading = true;
    this.error = '';
    this.successMessage = '';
    this.cdr.detectChanges();

    const updateData = {
      full_name: this.editForm.full_name,
      email: this.editForm.email
    };

    const url = this.isAdminViewingOther 
      ? `${environment.apiUrl}/api/admin/users/${this.user?.id}`
      : `${environment.apiUrl}/api/users/${this.user?.id}`;

    this.http.put(url, updateData).subscribe({
      next: () => {
        this.updateLoading = false;
        this.successMessage = 'Profile updated successfully!';
        this.cdr.detectChanges();
        
        // Refresh user data
        if (this.isAdminViewingOther) {
          this.loadUserById(this.user!.id);
        } else {
          this.authService.fetchCurrentUser().subscribe({
            next: (updatedUser) => {
              this.user = updatedUser;
              this.editForm.full_name = updatedUser.full_name || '';
              this.editForm.email = updatedUser.email || '';
              this.isEditing = false;
              this.cdr.detectChanges();
            }
          });
        }
        
        setTimeout(() => {
          this.successMessage = '';
          this.cdr.detectChanges();
        }, 3000);
      },
      error: (err) => {
        this.updateLoading = false;
        this.error = err.error?.detail || 'Failed to update profile. Please try again.';
        this.cdr.detectChanges();
        
        setTimeout(() => {
          this.error = '';
          this.cdr.detectChanges();
        }, 5000);
      }
    });
  }

  formatDate(dateString: string | undefined): string {
    if (!dateString) return 'Not available';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getRoleBadgeClass(role: string): string {
    switch(role) {
      case 'admin': return 'badge-admin';
      case 'manager': return 'badge-manager';
      case 'operator': return 'badge-operator';
      default: return 'badge-viewer';
    }
  }

  togglePasswordForm() {
    if (this.isAdminViewingOther) {
      this.passwordError = 'You cannot change another user\'s password here.';
      setTimeout(() => {
        this.passwordError = '';
        this.cdr.detectChanges();
      }, 3000);
      return;
    }
    
    this.showPasswordForm = !this.showPasswordForm;
    if (!this.showPasswordForm) {
      this.passwordForm = { old_password: '', new_password: '', confirm_password: '' };
      this.passwordError = '';
      this.passwordSuccess = '';
    }
    this.cdr.detectChanges();
  }

  changePassword() {
    if (this.passwordForm.new_password !== this.passwordForm.confirm_password) {
      this.passwordError = 'New passwords do not match';
      this.cdr.detectChanges();
      return;
    }

    if (this.passwordForm.new_password.length < 6) {
      this.passwordError = 'Password must be at least 6 characters';
      this.cdr.detectChanges();
      return;
    }

    this.passwordLoading = true;
    this.passwordError = '';
    this.passwordSuccess = '';
    this.cdr.detectChanges();

    const token = this.authService.getToken();
    const url = `${environment.apiUrl}/api/auth/change-password`;

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        old_password: this.passwordForm.old_password,
        new_password: this.passwordForm.new_password
      })
    })
    .then(async response => {
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to change password');
      }
      return response.json();
    })
    .then(() => {
      this.passwordLoading = false;
      this.passwordSuccess = 'Password changed successfully!';
      this.passwordForm = { old_password: '', new_password: '', confirm_password: '' };
      this.cdr.detectChanges();

      setTimeout(() => {
        this.passwordSuccess = '';
        this.showPasswordForm = false;
        this.cdr.detectChanges();
      }, 3000);
    })
    .catch(err => {
      this.passwordLoading = false;
      this.passwordError = err.message || 'Failed to change password. Please check your current password.';
      this.cdr.detectChanges();
      setTimeout(() => {
        this.passwordError = '';
        this.cdr.detectChanges();
      }, 5000);
    });
  }

  goBack() {
    if (this.isAdminViewingOther) {
      this.router.navigate(['/admin/profile-management']);
    } else {
      this.router.navigate(['/home']);
    }
  }
}