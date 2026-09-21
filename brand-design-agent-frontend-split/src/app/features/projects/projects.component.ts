import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AppShellComponent } from '../../shared/app-shell.component';
import { ConfirmDialogComponent } from '../../shared/dialogs/confirm-dialog.component';
import { ProjectCreateDialogComponent } from '../../shared/dialogs/project-create-dialog.component';
import { Project } from '../../core/models/app.models';
import { ProjectService } from '../../core/services/project.service';
import { ToastService } from '../../core/services/toast.service';

@Component({ standalone: true, imports: [CommonModule, RouterLink, AppShellComponent, MatDialogModule], templateUrl: './projects.component.html', styleUrl: './projects.component.scss' })
export class ProjectsComponent implements OnInit {
  readonly projectService = inject(ProjectService);
  readonly router = inject(Router);
  readonly toast = inject(ToastService);
  readonly dialog = inject(MatDialog);
  readonly query = signal('');
  readonly deleting = signal<Project | undefined>(undefined);
  loading = false;
  error = '';
  newProjectName = '';
  newProjectDescription = '';

  get filteredProjects(): Project[] {
    const q = this.query().trim().toLowerCase();
    return this.projectService.projects().filter(p => !q || `${p.name} ${p.description}`.toLowerCase().includes(q));
  }

  ngOnInit(): void { void this.load(); }

  async load() {
    this.loading = true; this.error = '';
    try { await this.projectService.loadProjects(); }
    catch (err: any) { this.error = err?.error?.detail ?? 'Unable to load projects.'; }
    finally { this.loading = false; }
  }

  openCreate() {
    const ref = this.dialog.open(ProjectCreateDialogComponent, { width: 'min(480px, calc(100vw - 32px))', maxWidth: '100vw', data: {} });
    ref.afterClosed().subscribe(result => {
      if (!result) return;
      this.newProjectName = result.name;
      this.newProjectDescription = result.description;
      void this.createProject();
    });
  }

  async createProject() {
    const name = this.newProjectName.trim(); if (!name || this.loading) return;
    this.loading = true;
    try {
      const project = await this.projectService.createProject(name, this.newProjectDescription);
      this.toast.show(`Project “${project.name}” created.`);
      await this.router.navigate(['/projects', project.id]);
    } catch (err: any) { this.error = err?.error?.detail ?? 'Unable to create project.'; }
    finally { this.loading = false; }
  }

  async deleteProject(project: Project, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: 'min(440px, calc(100vw - 32px))',
      maxWidth: '100vw',
      data: {
        title: 'Delete project?',
        message: `This will permanently delete ${project.name}, its documents, and generated artifacts.`,
        confirmLabel: 'Delete project',
        danger: true
      }
    });
    ref.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.deleting.set(project);
        void this.confirmDelete();
      }
    });
  }

  cancelDelete() { this.deleting.set(undefined); }

  async confirmDelete() {
    const project = this.deleting();
    if (!project) return;
    this.loading = true;
    try {
      await this.projectService.deleteProject(project.id);
      this.toast.show('Project deleted.');
      this.cancelDelete();
    } catch (err: any) { this.error = err?.error?.detail ?? 'Unable to delete project.'; }
    finally { this.loading = false; }
  }
}
