import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.html',
  styleUrls: ['./home.css']
})
export class HomeComponent implements OnInit {
  userFullName: string = '';
  userRole: string = '';

  constructor(
    private router: Router,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.userFullName = user.full_name || user.username;
        this.userRole = user.role;
        this.cdr.detectChanges();
      }
    });
  }

  hasPermission(name: string): boolean {
    return this.authService.hasPermission(name);
  }

  navigateTo(docType: string) {
    switch(docType) {
      case 'id-card':
        this.router.navigate(['/extraction/id-card']);
        break;
      case 'invoice':
        this.router.navigate(['/extraction/invoice']);
        break;
      case 'passport':
        this.router.navigate(['/extraction/passport']);
        break;
      case 'contract':
        this.router.navigate(['/extraction/contract']);
        break;
    }
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }

  logout() {
    this.authService.logout();
    // The AuthService.logout() already navigates to login
  }
}