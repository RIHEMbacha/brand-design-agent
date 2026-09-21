import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { ProjectFile } from '../../core/models/app.models';

export interface ReferenceFilesDialogData {
  files: ProjectFile[];
  onFilesSelected: (files: File[]) => Promise<ProjectFile[]>;
  onDelete?: (file: ProjectFile) => Promise<ProjectFile[]>;
}

@Component({
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Reference files</h2>
    <mat-dialog-content>
      <p class="dialog-subtitle">Upload images, PDFs, JSON, or a ZIP package for this project.</p>
      <div class="dropzone" [class.dragging]="dragging" (dragover)="dragging = true; $event.preventDefault()" (dragleave)="dragging = false" (drop)="drop($event)">
        <input type="file" multiple accept=".zip,.png,.jpg,.jpeg,.webp,.pdf,.json,.txt" (change)="select($event)">
        <strong>Drop files here or browse</strong>
        <p>ZIP is supported for a complete reference package.</p>
      </div>
      <div class="file-list">
        @for (file of files; track file.name + file.size) {
          <div class="file-row">
            <div><strong>{{ file.name }}</strong><span>{{ file.type }} · {{ formatSize(file.size) }}</span></div>
            @if (data.onDelete) {
              <button mat-icon-button type="button" aria-label="Delete document" [disabled]="loading" (click)="remove(file)">×</button>
            } @else {
              <span class="ready">Ready</span>
            }
          </div>
        } @empty {
          <p class="empty">No reference files yet.</p>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-flat-button class="dialog-purple-button" type="button" (click)="dialogRef.close()">Close</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-subtitle { margin: -8px 0 18px; color: var(--muted); font-size: 12px; }
    .dropzone { position: relative; padding: 24px 18px; border: 1.5px dashed #cfd2e1; border-radius: 16px; text-align: center; background: #fafaff; }
    .dropzone.dragging { border-color: var(--primary); background: var(--primary-soft); }
    .dropzone input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .dropzone strong { display: block; font-size: 12px; }
    .dropzone p { margin: 6px 0 0; color: var(--muted); font-size: 10px; }
    .file-list { display: grid; gap: 8px; margin-top: 16px; }
    .file-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 10px; }
    .file-row strong, .file-row span { display: block; }
    .file-row strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
    .file-row span { margin-top: 3px; color: var(--muted); font-size: 10px; }
    .ready { color: var(--success) !important; }
    .empty { color: var(--muted); text-align: center; font-size: 12px; }
  `]
})
export class ReferenceFilesDialogComponent {
  files: ProjectFile[];
  dragging = false;
  loading = false;

  constructor(
    @Inject(MAT_DIALOG_DATA) readonly data: ReferenceFilesDialogData,
    readonly dialogRef: MatDialogRef<ReferenceFilesDialogComponent>
  ) {
    this.files = [...data.files];
  }

  select(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) void this.add(Array.from(input.files));
    input.value = '';
  }

  drop(event: DragEvent): void {
    event.preventDefault();
    this.dragging = false;
    if (event.dataTransfer?.files.length) void this.add(Array.from(event.dataTransfer.files));
  }

  private async add(selected: File[]): Promise<void> {
    this.loading = true;
    try {
      this.files = await this.data.onFilesSelected(selected);
    } finally {
      this.loading = false;
    }
  }

  async remove(file: ProjectFile): Promise<void> {
    if (!this.data.onDelete) return;
    this.loading = true;
    try {
      this.files = await this.data.onDelete(file);
    } finally {
      this.loading = false;
    }
  }

  formatSize(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
}
