import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AppShellComponent } from '../../shared/app-shell.component';
import { ConfirmDialogComponent } from '../../shared/dialogs/confirm-dialog.component';
import { ReferenceFilesDialogComponent } from '../../shared/dialogs/reference-files-dialog.component';
import { InterfaceScreen, Project, ProjectFile } from '../../core/models/app.models';
import { ProjectService } from '../../core/services/project.service';
import { ToastService } from '../../core/services/toast.service';

@Component({ standalone: true, imports: [CommonModule, RouterLink, AppShellComponent, MatDialogModule], templateUrl: './interfaces.component.html', styleUrl: './interfaces.component.scss' })
export class InterfacesComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  readonly projectService = inject(ProjectService);
  readonly router = inject(Router);
  readonly toast = inject(ToastService);
  readonly dialog = inject(MatDialog);
  project?: Project;
  interfaces: InterfaceScreen[] = [];
  files: ProjectFile[] = [];
  showingFiles = signal(false); dragging = signal(false);
  deletingFile = signal<ProjectFile | undefined>(undefined);
  deletingArtifact = signal<InterfaceScreen | undefined>(undefined);
  loading = false; error = '';

  async ngOnInit(): Promise<void> {
    const projectId = this.route.snapshot.paramMap.get('id');
    if (!projectId) {
      this.error = 'Unable to load project data.';
      return;
    }

    try {
      this.project = await this.projectService.loadProject(projectId);
      if (!this.project) return;
      await Promise.all([
        this.projectService.loadArtifacts(projectId),
        this.projectService.loadFiles(projectId)
      ]);
      this.refresh(projectId);
    } catch (err: any) { this.error = err?.error?.detail ?? 'Unable to load project data.'; }
  }

  private refresh(projectId: string) {
    if (!this.project) return;
    this.interfaces = this.projectService.getInterfaces(projectId);
    this.files = this.projectService.getFiles(projectId);
  }
  openFiles() {
    if (!this.project) return;
    this.dialog.open(ReferenceFilesDialogComponent, {
      width: 'min(620px, calc(100vw - 32px))',
      maxWidth: '100vw',
      data: {
        files: this.files,
        onFilesSelected: async (selected: File[]) => {
          await this.addSelectedFiles(selected);
          return this.files;
        },
        onDelete: async (file: ProjectFile) => {
          const confirmed = await this.confirmFileDeletion(file);
          return confirmed ? this.files : [...this.files];
        }
      }
    });
  }
  closeFiles() { this.showingFiles.set(false); this.dragging.set(false); }
  handleFiles(event: Event) { const input = event.target as HTMLInputElement; if (input.files?.length) void this.addSelectedFiles(Array.from(input.files)); input.value = ''; }
  handleDrop(event: DragEvent) { event.preventDefault(); this.dragging.set(false); if (event.dataTransfer?.files.length) void this.addSelectedFiles(Array.from(event.dataTransfer.files)); }

  private async addSelectedFiles(selected: File[]) {
    if (!this.project) return;
    this.loading = true;
    try { await this.projectService.uploadFiles(this.project.id, selected); this.refresh(this.project.id); this.toast.show(`${selected.length} reference file${selected.length === 1 ? '' : 's'} added.`); }
    catch (err: any) { this.toast.show(err?.error?.detail ?? 'Unable to upload file.'); }
    finally { this.loading = false; }
  }

  async deleteFile(file: ProjectFile, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.project || !file.id) return;
    await this.confirmFileDeletion(file);
  }

  private async confirmFileDeletion(file: ProjectFile): Promise<boolean> {
    const confirmed = await this.dialog.open(ConfirmDialogComponent, {
      width: 'min(420px, calc(100vw - 32px))',
      maxWidth: '100vw',
      data: { title: 'Delete document?', message: `This will permanently delete ${file.name}.`, confirmLabel: 'Delete document', danger: true }
    }).afterClosed().toPromise();
    if (confirmed) {
      this.deletingFile.set(file);
      await this.confirmDeleteFile();
    }
    return !!confirmed;
  }

  cancelDeleteFile() { this.deletingFile.set(undefined); }

  async confirmDeleteFile() {
    const file = this.deletingFile();
    if (!this.project || !file?.id) return;
    this.loading = true;
    try {
      await this.projectService.deleteFile(this.project.id, file.id);
      this.files = this.projectService.getFiles(this.project.id);
      this.toast.show('Document deleted.');
      this.cancelDeleteFile();
    } catch (err: any) { this.toast.show(err?.error?.detail ?? 'Unable to delete document.'); }
    finally { this.loading = false; }
  }

  async deleteArtifact(screen: InterfaceScreen, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this.project || !screen.artifactId) return;
    const confirmed = await this.dialog.open(ConfirmDialogComponent, {
      width: 'min(420px, calc(100vw - 32px))',
      maxWidth: '100vw',
      data: { title: 'Delete artifact?', message: `This will permanently delete ${screen.name}.`, confirmLabel: 'Delete artifact', danger: true }
    }).afterClosed().toPromise();
    if (confirmed) {
      this.deletingArtifact.set(screen);
      await this.confirmDeleteArtifact();
    }
  }

  cancelDeleteArtifact() { this.deletingArtifact.set(undefined); }

  async confirmDeleteArtifact() {
    const screen = this.deletingArtifact();
    if (!this.project || !screen?.artifactId) return;
    this.loading = true;
    try {
      await this.projectService.deleteArtifact(this.project.id, screen.artifactId);
      this.interfaces = this.projectService.getInterfaces(this.project.id);
      this.toast.show('Artifact deleted.');
      this.cancelDeleteArtifact();
    } catch (err: any) { this.toast.show(err?.error?.detail ?? 'Unable to delete artifact.'); }
    finally { this.loading = false; }
  }

  formatSize(size: number): string { if (size < 1024) return `${size} B`; if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`; return `${(size / (1024 * 1024)).toFixed(1)} MB`; }
  addInterface() {
    if (!this.project) return;
    void this.router.navigate(['/projects', this.project.id, 'workspace']);
  }

  openInterface(screen: InterfaceScreen) {
    if (!this.project || !screen.artifactId) return;
    void this.router.navigate(['/projects', this.project.id, 'workspace', 'result'], {
      queryParams: { artifactId: screen.artifactId, interface: screen.id }
    });
  }

  trackById(_: number, item: InterfaceScreen): string { return item.id; }
}
