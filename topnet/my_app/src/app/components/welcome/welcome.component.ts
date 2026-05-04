import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './welcome.component.html',
  styleUrls: ['./welcome.component.css']
})
export class WelcomeComponent implements OnInit {
  username: string = '';
  isProfileAdmin: boolean = false;
  isSystemAdmin: boolean = false;
  isRegularUser: boolean = false;
  loading = true;

  constructor(private authService: AuthService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    // Try to get user from BehaviorSubject first
    const user = this.authService.getCurrentUser();
    
    if (user) {
      this.setUserData(user);
      this.loading = false;
      this.cdr.detectChanges();
    } else {
      // If not available, fetch it
      this.authService.fetchCurrentUser().subscribe({
        next: (user) => {
          this.setUserData(user);
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('Error fetching user:', err);
          this.loading = false;
          this.cdr.detectChanges();
        }
      });
    }
  }

  setUserData(user: any) {
    this.username = user.full_name || user.username;
    this.isProfileAdmin = user.role === 'profile_admin';
    this.isSystemAdmin = user.role === 'system_admin';
    this.isRegularUser = !this.isProfileAdmin && !this.isSystemAdmin && user.role !== 'admin';
  }
}