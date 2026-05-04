import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css']
})
export class LandingComponent {
  constructor(
    private router: Router,
    private authService: AuthService
  ) {}
/*
  ngOnInit() {
    // ken user deja  logged in --> redirect lel home
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/home']);
    }
  }*/

  goToLogin() {
    this.router.navigate(['/login']);
  }

  goToRegister() {
    this.router.navigate(['/register']);
  }
}