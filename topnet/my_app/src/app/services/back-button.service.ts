import { Injectable } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class BackButtonService {
  private showBackButtonSubject = new BehaviorSubject<boolean>(false);
  showBackButton$ = this.showBackButtonSubject.asObservable();

  // Pages where back button should be hidden
  private readonly hiddenRoutes = [
    '/home',
    '/dashboard',
    '/analytics',
    '/favorites'
  ];

  constructor(private router: Router) {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.checkRoute(event.urlAfterRedirects);
      }
    });
  }

  private checkRoute(url: string) {
    // Check if current URL starts with any hidden route
    const shouldHide = this.hiddenRoutes.some(route => 
      url === route || url.startsWith(route + '/')
    );
    
    this.showBackButtonSubject.next(!shouldHide);
  }
}