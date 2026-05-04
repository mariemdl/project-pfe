import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { SidebarSearchService, SidebarItem } from '../../services/sidebar-search';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.css']
})
export class SidebarComponent implements OnInit {
  isSidebarClosed = false;
  isDarkMode = false;
  darkModeText = 'Dark Mode';

  searchTerm = '';
  filteredItems: SidebarItem[] = [];
  allItems: SidebarItem[] = [];
  hasVisibleItems = true;
  userLoaded = false;  // Add this flag

  constructor(
    private router: Router,
    private searchService: SidebarSearchService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode === 'true') {
      this.isDarkMode = true;
      document.body.classList.add('dark');
      this.darkModeText = 'Light Mode';
    }

    // Wait for user data to be loaded first
    this.authService.currentUser$.subscribe(user => {
      console.log('🔵 Sidebar - User loaded:', user);
      if (user) {
        this.userLoaded = true;
        // Now subscribe to sidebar items
        this.setupSidebarSubscription();
      }
    });

    if (this.isSidebarClosed) {
      document.body.classList.add('sidebar-closed');
    } else {
      document.body.classList.remove('sidebar-closed');
    }
  }

  private setupSidebarSubscription() {
    // Subscribe to sidebar items
    this.searchService.sidebarItems$.subscribe(items => {
      console.log('🔵 Sidebar received items:', items.map(i => ({ name: i.name, visible: i.visible })));
      this.allItems = items;
      this.filteredItems = items.filter(item => item.visible);
      this.hasVisibleItems = this.filteredItems.length > 0;
      console.log('🔵 Filtered items (visible only):', this.filteredItems.map(i => i.name));
      this.cdr.detectChanges();
    });

    // Subscribe to search term
    this.searchService.searchTerm$.subscribe(term => {
      this.searchTerm = term;
    });
  }

  onSearch() {
    this.searchService.setSearchTerm(this.searchTerm);
  }

  clearSearch(event: Event) {
    event.stopPropagation();
    this.searchTerm = '';
    this.searchService.setSearchTerm('');
  }

  onItemClick() {
    if (window.innerWidth <= 768) {
      this.isSidebarClosed = true;
    }
  }

  toggleSidebar() {
    this.isSidebarClosed = !this.isSidebarClosed;

    if (this.isSidebarClosed) {
      document.body.classList.add('sidebar-closed');
    } else {
      document.body.classList.remove('sidebar-closed');
    }
  }

  openSidebar() {
    this.isSidebarClosed = false;
    document.body.classList.remove('sidebar-closed');
  }

  toggleDarkMode() {
    this.isDarkMode = !this.isDarkMode;
    if (this.isDarkMode) {
      document.body.classList.add('dark');
      this.darkModeText = 'Light Mode';
      localStorage.setItem('darkMode', 'true');
    } else {
      document.body.classList.remove('dark');
      this.darkModeText = 'Dark Mode';
      localStorage.setItem('darkMode', 'false');
    }
  }

  logout() {
    console.log('🔵 sidebar - logout button clicked');
    this.authService.logout();
  }
}