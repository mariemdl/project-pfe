import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent implements OnInit {
  // User fields
  email = '';
  username = '';
  password = '';
  confirmPassword = '';
  fullName = '';
  
  // Permission checkboxes
  permissions = {
    idcard: false,
    invoice: false,
    contract: false,
    passport: false,
    view_subordinates: false
  };
  
  // Manager selection (appears when view_subordinates is checked)
  availableManagers: any[] = [];
  selectedManagerId: number | null = null;
  showManagerSelection = false;
  
  // Subordinate selection popup (for when user is a manager)
  showSubordinatePopup = false;
  allActiveUsers: any[] = [];
  filteredActiveUsers: any[] = [];
  selectedSubordinates: number[] = [];
  subordinateSearchTerm = '';
  
  // UI state
  error = '';
  successMessage = '';
  loading = false;
  isSubmitting = false;

  private apiUrl = `${environment.apiUrl}/api/admin`;

  constructor(
    private http: HttpClient,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadAvailableManagers();
    this.loadAllActiveUsers();
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

  loadAllActiveUsers() {
    this.http.get<any[]>(`${this.apiUrl}/users/active`).subscribe({
      next: (data) => {
        console.log('Active users loaded:', data);
        this.allActiveUsers = data;
        this.filteredActiveUsers = [...data];
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error loading active users:', err);
        this.cdr.detectChanges();
      }
    });
  }

  onPermissionChange() {
    // Show manager selection if view_subordinates is checked
    this.showManagerSelection = this.permissions.view_subordinates;
    
    // Reset manager selection if not a manager
    if (!this.showManagerSelection) {
      this.selectedManagerId = null;
    }
    this.cdr.detectChanges();
  }

  getSelectedPermissionIds(): number[] {
    const ids: number[] = [];
    
    // Permission IDs (these must match your database)
    if (this.permissions.idcard) ids.push(1);
    if (this.permissions.invoice) ids.push(2);
    if (this.permissions.contract) ids.push(3);
    if (this.permissions.passport) ids.push(4);
    if (this.permissions.view_subordinates) ids.push(5);
    
    return ids;
  }
  
  getPermissionNames(): string {
    const names: string[] = [];
    if (this.permissions.idcard) names.push('ID Card');
    if (this.permissions.invoice) names.push('Invoice');
    if (this.permissions.contract) names.push('Contract');
    if (this.permissions.passport) names.push('Passport');
    if (this.permissions.view_subordinates) names.push('Subordinates');
    return names.join(', ');
  }

  // Check if user already exists
  async checkUserExists(): Promise<boolean> {
    try {
      const users = await firstValueFrom(
        this.http.get<any[]>(`${this.apiUrl}/users?search=${this.username}`).pipe(timeout(8000))
      );
      const exists = users.some(user => 
        user.username === this.username || user.email === this.email
      );
      if (exists) {
        this.error = `❌ A user with username "${this.username}" or email "${this.email}" already exists. Please use different credentials.`;
        this.cdr.detectChanges();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Error checking user existence:', err);
      this.cdr.detectChanges();
      return false;
    }
  }

  // Subordinate Popup Methods
  openSubordinatePopup() {
    this.selectedSubordinates = [];
    this.subordinateSearchTerm = '';
    this.filteredActiveUsers = [...this.allActiveUsers];
    this.showSubordinatePopup = true;
    this.cdr.detectChanges();
  }

  closeSubordinatePopup() {
    this.showSubordinatePopup = false;
    this.cdr.detectChanges();
  }

  filterSubordinates() {
    if (!this.subordinateSearchTerm) {
      this.filteredActiveUsers = [...this.allActiveUsers];
    } else {
      const term = this.subordinateSearchTerm.toLowerCase();
      this.filteredActiveUsers = this.allActiveUsers.filter(user => 
        user.username.toLowerCase().includes(term) ||
        (user.full_name && user.full_name.toLowerCase().includes(term)) ||
        user.email.toLowerCase().includes(term)
      );
    }
    this.cdr.detectChanges();
  }

  toggleSubordinate(userId: number) {
    const index = this.selectedSubordinates.indexOf(userId);
    if (index === -1) {
      this.selectedSubordinates.push(userId);
    } else {
      this.selectedSubordinates.splice(index, 1);
    }
    this.cdr.detectChanges();
  }

  isSubordinateSelected(userId: number): boolean {
    return this.selectedSubordinates.includes(userId);
  }

  getSelectedSubordinateNames(): string {
    const selectedUsers = this.allActiveUsers.filter(u => this.selectedSubordinates.includes(u.id));
    return selectedUsers.map(u => u.full_name || u.username).join(', ');
  }

  async onSubmit() {
    // Reset messages
    this.error = '';
    this.successMessage = '';
    this.cdr.detectChanges();
    
    // Prevent double submission
    if (this.loading || this.isSubmitting) {
      console.log('Already submitting, ignoring...');
      return;
    }
    
    // Validate required fields
    if (!this.username) {
      this.error = 'Username is required';
      this.cdr.detectChanges();
      return;
    }
    
    if (!this.email) {
      this.error = 'Email is required';
      this.cdr.detectChanges();
      return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) {
      this.error = 'Please enter a valid email address';
      this.cdr.detectChanges();
      return;
    }
    
    // Validate passwords match (if password provided)
    if (this.password && this.password !== this.confirmPassword) {
      this.error = 'Passwords do not match';
      this.cdr.detectChanges();
      return;
    }

    // Validate password length (if password provided)
    if (this.password && this.password.length < 6) {
      this.error = 'Password must be at least 6 characters';
      this.cdr.detectChanges();
      return;
    }

    // Validate at least one permission is selected
    const selectedPermissions = this.getSelectedPermissionIds();
    if (selectedPermissions.length === 0) {
      this.error = 'Please select at least one permission for the user';
      this.cdr.detectChanges();
      return;
    }

    // Check if user already exists BEFORE creating
    this.loading = true;
    this.cdr.detectChanges();
    const exists = await this.checkUserExists();
    this.loading = false;
    this.cdr.detectChanges();
    
    if (exists) {
      return; // Stop here - error already set in checkUserExists
    }

    // If this is a manager, show subordinate popup first
    if (this.permissions.view_subordinates) {
      this.openSubordinatePopup();
      return;
    }

    // Otherwise, create user directly
    this.createUser();
  }

  createUser() {
    if (this.isSubmitting) {
      console.log('Already creating user, ignoring...');
      return;
    }

    this.isSubmitting = true;
    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();
    
    // Prepare data for admin API
    const userData = {
      email: this.email,
      username: this.username,
      password: this.password || undefined,
      full_name: this.fullName,
      permission_ids: this.getSelectedPermissionIds(),
      manager_id: this.showManagerSelection ? this.selectedManagerId : null,
      subordinate_ids: this.selectedSubordinates // For manager, send selected subordinates
    };
    
    console.log('Creating user:', userData);
    
    this.http.post(`${this.apiUrl}/users`, userData).pipe(timeout(15000)).subscribe({
      next: (response: any) => {
        console.log('User created successfully:', response);
        this.isSubmitting = false;
        this.loading = false;
        this.successMessage = `✅ User "${this.username}" created successfully!`;
        this.cdr.detectChanges();
        this.closeSubordinatePopup();
        setTimeout(() => {
          this.resetForm();
          this.cdr.detectChanges();
          setTimeout(() => this.router.navigate(['/admin/profile-management']), 1000);
        }, 2000);
      },
      error: (err) => {
        console.error('Creation error:', err);
        this.isSubmitting = false;
        this.loading = false;
        if (err.name === 'TimeoutError') {
          this.error = '❌ Request timed out. Please try again.';
        } else if (err.status === 400) {
          const errorMsg = err.error?.detail || 'Invalid data';
          this.error = `❌ ${errorMsg}`;
        } else if (err.status === 403) {
          this.error = '❌ You do not have permission to create users.';
        } else if (err.status === 401) {
          this.error = '❌ Session expired. Please log in again.';
          setTimeout(() => this.router.navigate(['/login']), 2000);
        } else {
          this.error = `❌ Failed to create user (${err.status || 'network error'}). Please try again.`;
        }
        this.cdr.detectChanges();
      }
    });
  }

  resetForm() {
    this.email = '';
    this.username = '';
    this.password = '';
    this.confirmPassword = '';
    this.fullName = '';
    this.permissions = {
      idcard: false,
      invoice: false,
      contract: false,
      passport: false,
      view_subordinates: false
    };
    this.selectedManagerId = null;
    this.showManagerSelection = false;
    this.selectedSubordinates = [];
    this.isSubmitting = false;
    this.loading = false;
    this.error = '';
    this.successMessage = '';
    this.cdr.detectChanges();
  }

  goToUsersList() {
    this.router.navigate(['/admin/profile-management']);
  }
}