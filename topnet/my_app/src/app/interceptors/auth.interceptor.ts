import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { Router } from '@angular/router';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Get the token
    const token = this.authService.getToken();
    
    console.log('🔵 Interceptor - URL:', req.url);
    console.log('🔵 Interceptor - Token exists:', !!token);

    // Add token to requests (except auth endpoints)
    if (token && !req.url.includes('/api/auth/')) {
      const authReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
      console.log('🔵 Interceptor - Added auth header to:', req.url);
      return next.handle(authReq);
    }

    return next.handle(req);
  }
}