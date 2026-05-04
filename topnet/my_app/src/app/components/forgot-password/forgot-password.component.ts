import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.css']
})
export class ForgotPasswordComponent {
  email = '';
  loading = false;
  successMessage = '';
  error = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  onSubmit() {
    if (!this.email) {
      this.error = 'Please enter your email address.';
      return;
    }

    this.loading = true;
    this.error = '';
    this.successMessage = '';

    this.authService.requestPasswordReset(this.email).subscribe({
      next: (response) => {
        this.loading = false;
        this.successMessage = response.message || 'If an account exists with this email, you will receive a reset link.';
        
        if (response.reset_link) {
          console.log('Reset link (development):', response.reset_link);
        }
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