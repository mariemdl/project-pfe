import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';

export interface SidebarItem {
  id: string;
  name: string;
  route: string;
  icon: string;
  visible: boolean;
  roles: string[];        // roles that can see this item
  originalVisible?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SidebarSearchService {
  private searchTermSubject = new BehaviorSubject<string>('');
  searchTerm$ = this.searchTermSubject.asObservable();

  private roleFilteredItems: SidebarItem[] = [];

  private originalItems: SidebarItem[] = [
    // Regular user items
    { id: 'home',      name: 'Home',      route: '/home',      icon: 'bx-home-alt',     visible: true, roles: ['viewer', 'operator', 'manager'] },
    { id: 'dashboard', name: 'Dashboard', route: '/dashboard', icon: 'bx-pie-chart-alt', visible: true, roles: ['viewer', 'operator', 'manager'] },
    { id: 'profile',   name: 'Profile',   route: '/profile',   icon: 'bx-user',          visible: true, roles: ['viewer', 'operator', 'manager'] },

    // Manager-only items
    { id: 'team-documents', name: 'Team Documents', route: '/manager/documents',   icon: 'bx-folder', visible: true, roles: ['manager'] },
    { id: 'subordinates',   name: 'My Team',        route: '/manager/subordinates', icon: 'bx-group',  visible: true, roles: ['manager'] },

    // Profile admin items (profile_admin only — admin has its own document-management)
    { id: 'profile-management', name: 'Profile Management', route: '/admin/profile-management', icon: 'bx-group', visible: true, roles: ['profile_admin', 'admin'] },

    // Admin-only items
    { id: 'document-management', name: 'Document Management', route: '/admin/document-management', icon: 'bx-folder', visible: true, roles: ['admin'] },

    // System admin items
    { id: 'system-admin', name: 'System Admin', route: '/system-admin', icon: 'bx-server', visible: true, roles: ['system_admin'] },
  ];

  sidebarItems$ = new BehaviorSubject<SidebarItem[]>([]);

  constructor(private authService: AuthService) {
    this.filterByRole();
    this.authService.currentUser$.subscribe(() => {
      this.filterByRole();
      this.applySearchFilter(this.searchTermSubject.value);
    });
  }

  private filterByRole() {
    const role = this.authService.getCurrentUser()?.role?.toLowerCase() ?? '';

    this.roleFilteredItems = this.originalItems.map(item => {
      const visible = item.roles.includes(role);
      return { ...item, visible, originalVisible: visible };
    });

    this.applySearchFilter(this.searchTermSubject.value);
  }

  setSearchTerm(term: string) {
    this.searchTermSubject.next(term);
    this.applySearchFilter(term);
  }

  private applySearchFilter(term: string) {
    if (!term || term.trim() === '') {
      this.sidebarItems$.next(
        this.roleFilteredItems.map(item => ({ ...item, visible: item.originalVisible ?? false }))
      );
    } else {
      const lower = term.toLowerCase();
      this.sidebarItems$.next(
        this.roleFilteredItems.map(item => ({
          ...item,
          visible: (item.originalVisible ?? false) && item.name.toLowerCase().includes(lower)
        }))
      );
    }
  }

  getVisibleItems() {
    return this.sidebarItems$.value.filter(item => item.visible);
  }

  hasVisibleItems(): boolean {
    return this.sidebarItems$.value.some(item => item.visible);
  }
}