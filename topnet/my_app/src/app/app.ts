import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SidebarComponent } from './components/sidebar/sidebar';
import { BackButtonComponent } from './components/back-button/back-button';
import { BackButtonService } from './services/back-button.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, SidebarComponent, BackButtonComponent, RouterOutlet],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class AppComponent implements OnInit {
  showBackButton$: Observable<boolean>;
  showSidebar = false;
  
  // Routes where sidebar should be hidden (public routes)
  private hideSidebarRoutes = ['/', '/landing', '/login', '/register', '/forgot-password', '/reset-password'];

  constructor(
    private backButtonService: BackButtonService,
    private router: Router
  ) {
    this.showBackButton$ = this.backButtonService.showBackButton$;
  }

  ngOnInit() {
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      const currentUrl = event.urlAfterRedirects;
      // Show sidebar only on protected routes (not on public routes)
      this.showSidebar = !this.hideSidebarRoutes.includes(currentUrl) && 
                          !currentUrl.startsWith('/login') && 
                          !currentUrl.startsWith('/register') &&
                          !currentUrl.startsWith('/forgot-password') &&
                          !currentUrl.startsWith('/reset-password') &&
                          currentUrl !== '/' &&
                          currentUrl !== '/landing';
      console.log('🔵 Route:', currentUrl, 'showSidebar:', this.showSidebar);
    });
  }
}