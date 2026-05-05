import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit{
  username = '';
  password = '';
  error = '';
  loading = false;

  constructor(
    private authService: AuthService,
    public router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    // If already logged in, redirect based on role
    if (this.authService.isAuthenticated()) {
      this.redirectBasedOnRole();
    }
  }

  redirectBasedOnRole() {
    const user = this.authService.getCurrentUser();
    const role = user?.role;

    if (role === 'admin') {
      this.router.navigate(['/admin/document-management']);
    } else if (role === 'profile_admin') {
      this.router.navigate(['/admin/profile-management']);
    } else if (role === 'system_admin') {
      this.router.navigate(['/system-admin']);
    } else if (role === 'manager') {
      this.router.navigate(['/manager/documents']);
    } else {
      this.router.navigate(['/welcome']);
    }
  }

  onSubmit() {
    // Validation des champs vides
    if (!this.username.trim()) {
      this.error = '❌ Veuillez entrer votre nom d\'utilisateur ou email.';
      return;
    }
    
    if (!this.password.trim()) {
      this.error = '❌ Veuillez entrer votre mot de passe.';
      return;
    }
    
    this.loading = true;
    this.error = '';
    
    // Timeout de sécurité pour éviter le blocage infini
    const timeoutId = setTimeout(() => {
      if (this.loading) {
        this.loading = false;
        this.error = '❌ La requête a expiré. Veuillez réessayer.';
      }
    }, 10000); // 10 secondes
    
    this.authService.login(this.username, this.password).subscribe({
      next: (response) => {
        clearTimeout(timeoutId);
        console.log('Login successful:', response);
        
        // Attendre que l'utilisateur soit chargé
        setTimeout(() => {
          const user = this.authService.getCurrentUser();
          const role = user?.role;
          
          // Redirect based on role
          if (role === 'admin') {
            this.router.navigate(['/admin/document-management']);
          } else if (role === 'profile_admin') {
            this.router.navigate(['/admin/profile-management']);
          } else if (role === 'system_admin') {
            this.router.navigate(['/system-admin']);
          } else if (role === 'manager') {
            this.router.navigate(['/manager/documents']);
          } else {
            this.router.navigate(['/welcome']);
          }
        }, 500);
      },
      error: (err) => {
        clearTimeout(timeoutId);
        console.error('Login error details:', err);
        
        // Gestion des différents types d'erreurs
        if (err.status === 401) {
          if (err.error?.detail?.toLowerCase().includes('inactive')) {
            this.error = '❌ Your account has been deactivated. Please contact an administrator.';
          } else {
            this.error = '❌ Email ou mot de passe incorrect. Veuillez réessayer.';
          }
        } 
        else if (err.status === 404) {
          this.error = '❌ Ce compte n\'existe pas. Veuillez vérifier vos identifiants.';
        }
        else if (err.status === 0) {
          this.error = '❌ Impossible de contacter le serveur. Vérifiez votre connexion.';
        }
        else if (err.error?.detail) {
          this.error = `❌ ${err.error.detail}`;
        }
        else if (err.message) {
          this.error = `❌ ${err.message}`;
        }
        else {
          this.error = '❌ Une erreur est survenue. Veuillez réessayer plus tard.';
        }

        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  clearError() {
    this.error = '';
  }

  goToForgotPassword() {
    this.router.navigate(['/forgot-password']);
  }
}