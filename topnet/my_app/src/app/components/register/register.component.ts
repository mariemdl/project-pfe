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
  email = '';
  username = '';
  password = '';
  confirmPassword = '';
  fullName = '';

  permissions = {
    idcard: false,
    invoice: false,
    contract: false,
    passport: false,
    view_subordinates: false
  };

  // Loaded from API — best-effort, not required for form submission
  permissionMap: Record<string, number> = {};

  availableManagers: any[] = [];
  selectedManagerId: number | null = null;
  showManagerSelection = false;

  showSubordinatePopup = false;
  allActiveUsers: any[] = [];
  filteredActiveUsers: any[] = [];
  selectedSubordinates: number[] = [];
  subordinateSearchTerm = '';

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
    this.loadPermissions();
    this.loadAvailableManagers();
    this.loadAllActiveUsers();
  }

  loadPermissions() {
    this.http.get<any[]>(`${this.apiUrl}/permissions`).subscribe({
      next: (data) => {
        data.forEach(p => { this.permissionMap[p.name] = p.id; });
        this.cdr.detectChanges();
      },
      error: () => {} // non-critical, form works without it
    });
  }

  loadAvailableManagers() {
    this.http.get<any[]>(`${this.apiUrl}/available-managers`).subscribe({
      next: (data) => { this.availableManagers = data; this.cdr.detectChanges(); },
      error: () => {}
    });
  }

  loadAllActiveUsers() {
    this.http.get<any[]>(`${this.apiUrl}/users/active`).subscribe({
      next: (data) => {
        this.allActiveUsers = data;
        this.filteredActiveUsers = [...data];
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  onPermissionChange() {
    this.showManagerSelection = this.permissions.view_subordinates;
    if (!this.showManagerSelection) this.selectedManagerId = null;
    this.cdr.detectChanges();
  }

  hasAnyPermission(): boolean {
    return Object.values(this.permissions).some(v => v);
  }

  getSelectedPermissionIds(): number[] {
    return (Object.keys(this.permissions) as Array<keyof typeof this.permissions>)
      .filter(name => this.permissions[name] && this.permissionMap[name] != null)
      .map(name => this.permissionMap[name]);
  }

  getPermissionNames(): string {
    const labels: Record<string, string> = {
      idcard: 'ID Card', invoice: 'Invoice', contract: 'Contract',
      passport: 'Passport', view_subordinates: 'Subordinates'
    };
    return (Object.keys(this.permissions) as Array<keyof typeof this.permissions>)
      .filter(k => this.permissions[k])
      .map(k => labels[k])
      .join(', ');
  }

  async checkUserExists(): Promise<boolean> {
    try {
      const users = await firstValueFrom(
        this.http.get<any[]>(`${this.apiUrl}/users?search=${this.username}`).pipe(timeout(8000))
      );
      const exists = users.some(u => u.username === this.username || u.email === this.email);
      if (exists) {
        this.error = `❌ Username "${this.username}" or email "${this.email}" already exists.`;
        this.cdr.detectChanges();
      }
      return exists;
    } catch {
      return false;
    }
  }

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
    const term = this.subordinateSearchTerm.toLowerCase();
    this.filteredActiveUsers = term
      ? this.allActiveUsers.filter(u =>
          u.username.toLowerCase().includes(term) ||
          (u.full_name?.toLowerCase().includes(term)) ||
          u.email.toLowerCase().includes(term))
      : [...this.allActiveUsers];
    this.cdr.detectChanges();
  }

  toggleSubordinate(userId: number) {
    const i = this.selectedSubordinates.indexOf(userId);
    if (i === -1) this.selectedSubordinates.push(userId);
    else this.selectedSubordinates.splice(i, 1);
    this.cdr.detectChanges();
  }

  isSubordinateSelected(userId: number): boolean {
    return this.selectedSubordinates.includes(userId);
  }

  getSelectedSubordinateNames(): string {
    return this.allActiveUsers
      .filter(u => this.selectedSubordinates.includes(u.id))
      .map(u => u.full_name || u.username)
      .join(', ');
  }

  async onSubmit() {
    this.error = '';
    this.successMessage = '';
    this.cdr.detectChanges();

    if (this.loading || this.isSubmitting) return;

    if (!this.username.trim()) { this.error = 'Username is required'; this.cdr.detectChanges(); return; }
    if (!this.email.trim()) { this.error = 'Email is required'; this.cdr.detectChanges(); return; }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email)) { this.error = 'Please enter a valid email address'; this.cdr.detectChanges(); return; }

    if (this.password && this.password !== this.confirmPassword) { this.error = 'Passwords do not match'; this.cdr.detectChanges(); return; }
    if (this.password && this.password.length < 6) { this.error = 'Password must be at least 6 characters'; this.cdr.detectChanges(); return; }

    // Validate using boolean flags — not IDs
    if (!this.hasAnyPermission()) {
      this.error = 'Please select at least one permission for the user';
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    this.cdr.detectChanges();
    const exists = await this.checkUserExists();
    this.loading = false;
    this.cdr.detectChanges();
    if (exists) return;

    if (this.permissions.view_subordinates) {
      this.openSubordinatePopup();
      return;
    }

    this.createUser();
  }

  createUser() {
    if (this.isSubmitting) return;

    this.isSubmitting = true;
    this.loading = true;
    this.error = '';
    this.cdr.detectChanges();

    const userData = {
      email: this.email,
      username: this.username,
      password: this.password || undefined,
      full_name: this.fullName,
      permission_ids: this.getSelectedPermissionIds(),
      is_manager: this.permissions.view_subordinates,
      manager_id: this.showManagerSelection ? this.selectedManagerId : null,
      subordinate_ids: this.selectedSubordinates
    };

    this.http.post(`${this.apiUrl}/users`, userData).pipe(timeout(15000)).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.loading = false;
        this.successMessage = `✅ User "${this.username}" created successfully!`;
        this.closeSubordinatePopup();
        this.cdr.detectChanges();
        setTimeout(() => {
          this.resetForm();
          setTimeout(() => this.router.navigate(['/admin/profile-management']), 1000);
        }, 2000);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.loading = false;
        if (err.name === 'TimeoutError') this.error = '❌ Request timed out. Please try again.';
        else if (err.status === 400) this.error = `❌ ${err.error?.detail || 'Invalid data'}`;
        else if (err.status === 403) this.error = '❌ You do not have permission to create users.';
        else if (err.status === 401) {
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
    this.permissions = { idcard: false, invoice: false, contract: false, passport: false, view_subordinates: false };
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
