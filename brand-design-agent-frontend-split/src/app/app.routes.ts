import { Routes } from '@angular/router';
import { authGuard } from './core/services/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'projects' },
  { path: 'login', pathMatch: 'full', redirectTo: 'auth/login' },
  { path: 'signup', pathMatch: 'full', redirectTo: 'auth/signup' },
  {
    path: 'auth/login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'auth/signup',
    loadComponent: () => import('./features/auth/signup.component').then(m => m.SignupComponent)
  },
  {
    path: 'projects',
    canActivate: [authGuard],
    loadComponent: () => import('./features/projects/projects.component').then(m => m.ProjectsComponent)
  },
  {
    path: 'projects/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./features/interfaces/interfaces.component').then(m => m.InterfacesComponent)
  },
  {
    path: 'projects/:id/workspace',
    canActivate: [authGuard],
    loadComponent: () => import('./features/project-detail/project-detail.component').then(m => m.ProjectDetailComponent)
  },
  {
    path: 'projects/:id/workspace/result',
    canActivate: [authGuard],
    loadComponent: () => import('./features/project-result/project-result.component').then(m => m.ProjectResultComponent)
  },
  { path: '**', redirectTo: 'projects' }
];
