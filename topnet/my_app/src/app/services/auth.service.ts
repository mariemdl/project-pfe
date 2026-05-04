import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap, catchError, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../environments/environment';

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  manager_id: number | null;
  is_active: boolean;
  created_at?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user_id: number;
  username: string;
  role: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();
  private tokenKey = 'auth_token';


  // Permission ID 
  private readonly PERMISSIONS = {
    IDCARD: 1,
    INVOICE: 2,
    CONTRACT: 3,
    PASSPORT: 4,
    VIEW_SUBORDINATES: 5
  };

  constructor(
    private http: HttpClient,
    private router: Router
  ) {
    this.loadStoredUser();
  }

  /**
   * Login user with username/email and password - VERSION CORRIGÉE
   */
  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/api/auth/login`, {
      username, password
    }).pipe(
      tap(response => {
        console.log('🔵 Login response:', response);
        if (response.access_token) {
          localStorage.setItem(this.tokenKey, response.access_token);
          console.log('🔵 Token saved');
          this.fetchCurrentUser().subscribe({
            next: (user) => console.log('🔵 User fetched:', user),
            error: (err) => console.error('🔴 Error fetching user:', err)
          });
        }
      }),
      catchError((error) => {
        console.error('🔴 Login error:', error);
        // Retourner l'erreur pour que le composant la reçoive
        return throwError(() => error);
      })
    );
  }

  /**
   * Register a new user
   */
  register(userData: {
    email: string;
    username: string;
    password: string;
    full_name: string;
    role?: string;
    manager_id?: number;
  }): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/api/auth/register`, userData);
  }

  /**
   * Fetch current user information from the API
   */
  fetchCurrentUser(): Observable<User> {
    const token = this.getToken();
    return new Observable(observer => {
      fetch(`${environment.apiUrl}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      .then(response => {
        if (!response.ok) throw new Error('Not authenticated');
        return response.json();
      })
      .then(user => {
        this.currentUserSubject.next(user);
        observer.next(user);
        observer.complete();
      })
      .catch(err => {
        observer.error(err);
      });
    });
  }

  /**
   * Logout user - clear token and user data
   */
  logout(): void {
    console.log('🔵 logout - starting');
  
    localStorage.clear();
    sessionStorage.clear();
    
    document.cookie.split(";").forEach(c => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
  
    fetch(`${environment.apiUrl}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.getToken()}`
      }
    }).finally(() => {
      this.currentUserSubject.next(null);
      window.location.replace('/login');
    });
  }

  /**
   * Get the stored JWT token
   */
  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  /**
   * Check if user has a specific role
   */
  hasRole(role: string): boolean {
    const user = this.currentUserSubject.value;
    if (!user) return false;
    return user.role === role || user.role === 'admin';
  }

  /**
   * Check if user is admin
   */
  isAdmin(): boolean {
    return this.hasRole('admin');
  }

  /**
   * Check if user is profile admin (admin or profile_admin role)
   */
  isProfileAdmin(): boolean {
    const user = this.currentUserSubject.value;
    if (!user) return false;
    return user.role === 'admin' || user.role === 'profile_admin';
  }

  /**
   * Check if user is manager
   */
  isManager(): boolean {
    return this.hasRole('manager');
  }

  /**
   * Get current user value synchronously
   */
  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Load stored user from token on app startup
   */
  private loadStoredUser(): void {
    const token = this.getToken();
    if (token) {
      this.fetchCurrentUser().subscribe({
        error: () => {
          console.log('🔵 loadStoredUser - token invalid, clearing');
          localStorage.removeItem(this.tokenKey);
          this.currentUserSubject.next(null);
        }
      });
    }
  }

  /**
   * Request password reset email
   */
  requestPasswordReset(email: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/auth/forgot-password`, { email });
  }

  /**
   * Reset password with token
   */
  resetPassword(token: string, newPassword: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/auth/reset-password`, { 
      token, 
      new_password: newPassword 
    });
  }

  /**
   * Validate reset token
   */
  validateResetToken(token: string): Observable<any> {
    return this.http.post(`${environment.apiUrl}/api/auth/validate-reset-token`, { token });
  }

  /**
   * Change user password (while logged in)
   */
  changePassword(oldPassword: string, newPassword: string): Observable<any> {
    const token = this.getToken();
    return this.http.post(`${environment.apiUrl}/api/auth/change-password`, {
      old_password: oldPassword,
      new_password: newPassword
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  }
  
}