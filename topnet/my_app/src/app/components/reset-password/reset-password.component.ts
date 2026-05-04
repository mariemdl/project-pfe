import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.css']
})
export class ResetPasswordComponent implements OnInit {
  token = '';
  newPassword = '';
  confirmPassword = '';
  loading = false;
  successMessage = '';
  error = '';
  tokenValid = false;
  validating = true;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit() {
    // Get token from URL
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    
    if (!this.token) {
      this.error = 'Invalid reset link. No token provided.';
      this.validating = false;
      return;
    }
    
    // Validate token
    this.authService.validateResetToken(this.token).subscribe({
      next: () => {
        this.tokenValid = true;
        this.validating = false;
      },
      error: (err) => {
        this.error = err.error?.detail || 'Invalid or expired reset link. Please request a new one.';
        this.tokenValid = false;
        this.validating = false;
      }
    });
  }

  onSubmit() {
    // Validate passwords
    if (this.newPassword !== this.confirmPassword) {
      this.error = 'Passwords do not match.';
      return;
    }
    
    if (this.newPassword.length < 6) {
      this.error = 'Password must be at least 6 characters long.';
      return;
    }

    this.loading = true;
    this.error = '';
    this.successMessage = '';

    this.authService.resetPassword(this.token, this.newPassword).subscribe({
      next: (response) => {
        this.loading = false;
        this.successMessage = response.message || 'Password reset successfully!';
        
        // Redirect to login after 3 seconds
        setTimeout(() => {
          this.router.navigate(['/login']);
        }, 3000);
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.detail || 'An error occurred. Please try again.';
      }
    });
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}