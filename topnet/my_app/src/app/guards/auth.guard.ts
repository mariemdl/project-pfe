import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): boolean {
    const isAuthenticated = this.authService.isAuthenticated();
    console.log('🔵 AuthGuard - URL:', state.url, 'isAuthenticated:', isAuthenticated);
    
    if (isAuthenticated) {
      return true;
    }
    
    console.log('🔵 AuthGuard - Not authenticated, redirect to login');
    this.router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }
}