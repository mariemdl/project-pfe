import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot } from '@angular/router';
import { Observable, filter, take, map, catchError, of } from 'rxjs';
import { AuthService } from '../services/auth.service';

@Injectable({ providedIn: 'root' })
export class RoleGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): Observable<boolean> | boolean {
    const allowedRoles: string[] = route.data['roles'] ?? [];
    const user = this.authService.getCurrentUser();

    if (user) {
      return this.checkRole(user.role, allowedRoles);
    }

    return this.authService.currentUser$.pipe(
      filter(u => u !== null),
      take(1),
      map(u => this.checkRole(u!.role, allowedRoles)),
      catchError(() => {
        this.router.navigate(['/login']);
        return of(false);
      })
    );
  }

  private checkRole(role: string, allowedRoles: string[]): boolean {
    if (allowedRoles.length === 0 || allowedRoles.includes(role)) {
      return true;
    }
    this.redirectByRole(role);
    return false;
  }

  private redirectByRole(role: string): void {
    const destinations: Record<string, string> = {
      admin: '/admin/document-management',
      profile_admin: '/admin/profile-management',
      system_admin: '/system-admin',
      manager: '/manager/documents',
    };
    this.router.navigate([destinations[role] ?? '/welcome']);
  }
}
