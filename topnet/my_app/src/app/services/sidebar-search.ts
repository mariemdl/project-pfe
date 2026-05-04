import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from './auth.service';

export interface SidebarItem {
  id: string;
  name: string;
  route: string;
  icon: string;
  visible: boolean;
  profileAdminOnly?: boolean;
  systemAdminOnly?: boolean;
  managerOnly?: boolean;
  regularOnly?: boolean;  // Only for regular users (non-admin)
  originalVisible?: boolean; // Store the original visibility from role filtering
}

@Injectable({
  providedIn: 'root'
})
export class SidebarSearchService {
  private searchTermSubject = new BehaviorSubject<string>('');
  searchTerm$ = this.searchTermSubject.asObservable();

  // Store the original items without search filtering
  private roleFilteredItems: SidebarItem[] = [];

  private originalItems: SidebarItem[] = [
    // Regular user items (only for non-admin users)
    { id: 'home', name: 'Home', route: '/home', icon: 'bx-home-alt', visible: true, regularOnly: true },
    { id: 'dashboard', name: 'Dashboard', route: '/dashboard', icon: 'bx-pie-chart-alt', visible: true, regularOnly: true },
    { id: 'profile', name: 'Profile', route: '/profile', icon: 'bx-user', visible: true, regularOnly: true },
    
    // Manager only items
    { id: 'team-documents', name: 'Team Documents', route: '/manager/documents', icon: 'bx-folder', visible: true, managerOnly: true },
    { id: 'subordinates', name: 'My Team', route: '/manager/subordinates', icon: 'bx-group', visible: true, managerOnly: true },
    
    // Profile Admin only items
    { id: 'profile-management', name: 'Profile Management', route: '/admin/profile-management', icon: 'bx-group', visible: true, profileAdminOnly: true },
    { id: 'document-management', name: 'Document Management', route: '/admin/document-management', icon: 'bx-folder', visible: true, profileAdminOnly: true },
    
    // System Admin only items
    { id: 'system-admin', name: 'System Admin', route: '/system-admin', icon: 'bx-server', visible: true, systemAdminOnly: true },
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
    const user = this.authService.getCurrentUser();
    const role = user?.role?.toLocaleLowerCase();
    
    console.log('🔵 Sidebar - Role detected:', role);
    
    // Filter by role and store original visibility
    this.roleFilteredItems = this.originalItems.map(item => {
      let visibleByRole = false;
      
      // Regular user items (only for viewers/operators, not admins)
      if (item.regularOnly && (role === 'viewer' || role === 'operator' || role === 'manager')) {
        visibleByRole = true;
      }
      // Manager items
      else if (role === 'manager' && item.managerOnly) {
        visibleByRole = true;
      }
      // Profile Admin items
      else if (role === 'profile_admin' && item.profileAdminOnly) {
        visibleByRole = true;
      }
      // System Admin items
      else if (role === 'system_admin' && item.systemAdminOnly) {
        visibleByRole = true;
      }
      // Super admin sees everything
      else if (role === 'admin') {
        visibleByRole = true;
      }
      
      return {
        ...item,
        visible: visibleByRole,
        originalVisible: visibleByRole
      };
    });
    
    console.log('🔵 Sidebar - Visible items by role:', this.roleFilteredItems.filter(i => i.visible).map(i => i.name));
    
    // Apply current search filter
    this.applySearchFilter(this.searchTermSubject.value);
  }

  setSearchTerm(term: string) {
    this.searchTermSubject.next(term);
    this.applySearchFilter(term);
  }

  private applySearchFilter(term: string) {
    if (!term || term.trim() === '') {
      // If search is empty, reset to role-based visible items
      const resetItems = this.roleFilteredItems.map(item => ({
        ...item,
        visible: item.originalVisible || false
      }));
      this.sidebarItems$.next(resetItems);
      console.log('🔵 Search cleared - showing all role-based items:', resetItems.filter(i => i.visible).map(i => i.name));
    } else {
      // Apply search filter
      const searchLower = term.toLowerCase();
      const filteredItems = this.roleFilteredItems.map(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchLower);
        return {
          ...item,
          visible: (item.originalVisible || false) && matchesSearch
        };
      });
      this.sidebarItems$.next(filteredItems);
      console.log('🔵 Search filter applied - term:', term, 'visible items:', filteredItems.filter(i => i.visible).map(i => i.name));
    }
  }

  getVisibleItems() {
    return this.sidebarItems$.value.filter(item => item.visible);
  }

  hasVisibleItems(): boolean {
    return this.sidebarItems$.value.some(item => item.visible);
  }
}