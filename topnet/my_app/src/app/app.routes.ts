import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { ProfileComponent } from './components/profile/profile.component';
import { AdminComponent } from './components/admin/admin.component';
import { LandingComponent } from './components/landing/landing.component';
import { SystemAdminComponent } from './components/system-admin/system-admin.component';

// Import the new Profile Admin components
import { UserManagementComponent } from './components/profile-admin/user-management/user-management.component';
import { DocumentManagementComponent } from './components/profile-admin/document-management/document-management.component';
import { AdminEditUserComponent } from './components/profile-admin/admin-edit-user/admin-edit-user.component';

import { WelcomeComponent } from './components/welcome/welcome.component';

export const routes: Routes = [
  // Landing page (public)
  { path: '', component: LandingComponent },
  { path: 'landing', component: LandingComponent },
  { path: 'welcome', component: WelcomeComponent, canActivate: [AuthGuard] },

  
  // Public routes
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },

  // Protected routes (no LayoutComponent wrapper)
  { path: 'home', loadComponent: () => import('./components/home/home').then(m => m.HomeComponent), canActivate: [AuthGuard] },
  { path: 'dashboard', loadComponent: () => import('./dashboard/dashboard').then(m => m.DashboardComponent), canActivate: [AuthGuard] },
  { path: 'profile', component: ProfileComponent, canActivate: [AuthGuard] },
  { path: 'profile/:id', component: ProfileComponent, canActivate: [AuthGuard] },
  { path: 'admin', component: AdminComponent, canActivate: [AuthGuard] },
  { path: 'system-admin', component: SystemAdminComponent, canActivate: [AuthGuard] },

  
  // ========== PROFILE ADMIN ROUTES ==========
  { path: 'admin/profile-management', component: UserManagementComponent, canActivate: [AuthGuard] },
  { path: 'admin/document-management', component: DocumentManagementComponent, canActivate: [AuthGuard] },
  { path: 'admin/create-user', component: RegisterComponent, canActivate: [AuthGuard] },
  { path: 'admin/edit-user/:id', component: AdminEditUserComponent, canActivate: [AuthGuard] },
  
  // Extraction routes
  { path: 'extraction/id-card', loadComponent: () => import('./components/id-card-extraction/id-card-extraction').then(m => m.IdCardExtractionComponent), canActivate: [AuthGuard] },
  { path: 'extraction/invoice', loadComponent: () => import('./components/invoice-extraction/invoice-extraction').then(m => m.InvoiceExtractionComponent), canActivate: [AuthGuard] },
  { path: 'extraction/passport', loadComponent: () => import('./components/passport-extraction/passport-extraction').then(m => m.PassportExtractionComponent), canActivate: [AuthGuard] },
  { path: 'extraction/contract', loadComponent: () => import('./components/contract-extraction/contract-extraction').then(m => m.ContractExtractionComponent), canActivate: [AuthGuard] },
  { path: 'extraction/results/:id', loadComponent: () => import('./shared/components/extraction-results/extraction-results').then(m => m.ExtractionResultsComponent), canActivate: [AuthGuard] },
  
  // Redirect any unknown routes to landing
  { path: '**', redirectTo: '' }
];