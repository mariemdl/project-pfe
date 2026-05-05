import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { RoleGuard } from './guards/role.guard';
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { ProfileComponent } from './components/profile/profile.component';
import { AdminComponent } from './components/admin/admin.component';
import { LandingComponent } from './components/landing/landing.component';
import { SystemAdminComponent } from './components/system-admin/system-admin.component';

import { UserManagementComponent } from './components/profile-admin/user-management/user-management.component';
import { DocumentManagementComponent } from './components/profile-admin/document-management/document-management.component';
import { AdminEditUserComponent } from './components/profile-admin/admin-edit-user/admin-edit-user.component';

import { WelcomeComponent } from './components/welcome/welcome.component';
import { ManagerDocumentsComponent } from './components/manager/manager-documents/manager-documents.component';
import { SubordinatesListComponent } from './components/manager/subordinates-list/subordinates-list.component';

export const routes: Routes = [
  // Public routes
  { path: '', component: LandingComponent },
  { path: 'landing', component: LandingComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },

  // Regular user routes (viewer / operator / manager share these)
  { path: 'welcome', component: WelcomeComponent, canActivate: [AuthGuard] },
  { path: 'home', loadComponent: () => import('./components/home/home').then(m => m.HomeComponent), canActivate: [AuthGuard, RoleGuard], data: { roles: ['viewer', 'operator', 'manager'] } },
  { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard').then(m => m.DashboardComponent), canActivate: [AuthGuard, RoleGuard], data: { roles: ['viewer', 'operator', 'manager'] } },
  { path: 'profile', component: ProfileComponent, canActivate: [AuthGuard, RoleGuard], data: { roles: ['viewer', 'operator', 'manager'] } },
  { path: 'profile/:id', component: ProfileComponent, canActivate: [AuthGuard, RoleGuard], data: { roles: ['viewer', 'operator', 'manager'] } },

  // Manager-only routes
  { path: 'manager/documents', component: ManagerDocumentsComponent, canActivate: [AuthGuard, RoleGuard], data: { roles: ['manager'] } },
  { path: 'manager/subordinates', component: SubordinatesListComponent, canActivate: [AuthGuard, RoleGuard], data: { roles: ['manager'] } },

  // Profile admin routes (profile_admin + admin)
  { path: 'admin/profile-management', component: UserManagementComponent, canActivate: [AuthGuard, RoleGuard], data: { roles: ['profile_admin', 'admin'] } },
  { path: 'admin/create-user', component: RegisterComponent, canActivate: [AuthGuard, RoleGuard], data: { roles: ['profile_admin', 'admin'] } },
  { path: 'admin/edit-user/:id', component: AdminEditUserComponent, canActivate: [AuthGuard, RoleGuard], data: { roles: ['profile_admin', 'admin'] } },

  // Admin-only routes
  { path: 'admin', component: AdminComponent, canActivate: [AuthGuard, RoleGuard], data: { roles: ['admin'] } },
  { path: 'admin/document-management', component: DocumentManagementComponent, canActivate: [AuthGuard, RoleGuard], data: { roles: ['admin'] } },

  // System admin routes
  { path: 'system-admin', component: SystemAdminComponent, canActivate: [AuthGuard, RoleGuard], data: { roles: ['system_admin'] } },

  // Extraction routes (viewer / operator / manager)
  { path: 'extraction/id-card', loadComponent: () => import('./components/id-card-extraction/id-card-extraction').then(m => m.IdCardExtractionComponent), canActivate: [AuthGuard, RoleGuard], data: { roles: ['viewer', 'operator', 'manager'] } },
  { path: 'extraction/invoice', loadComponent: () => import('./components/invoice-extraction/invoice-extraction').then(m => m.InvoiceExtractionComponent), canActivate: [AuthGuard, RoleGuard], data: { roles: ['viewer', 'operator', 'manager'] } },
  { path: 'extraction/passport', loadComponent: () => import('./components/passport-extraction/passport-extraction').then(m => m.PassportExtractionComponent), canActivate: [AuthGuard, RoleGuard], data: { roles: ['viewer', 'operator', 'manager'] } },
  { path: 'extraction/contract', loadComponent: () => import('./components/contract-extraction/contract-extraction').then(m => m.ContractExtractionComponent), canActivate: [AuthGuard, RoleGuard], data: { roles: ['viewer', 'operator', 'manager'] } },
  { path: 'extraction/results/:id', loadComponent: () => import('./shared/components/extraction-results/extraction-results').then(m => m.ExtractionResultsComponent), canActivate: [AuthGuard, RoleGuard], data: { roles: ['viewer', 'operator', 'manager'] } },

  { path: '**', redirectTo: '' }
];