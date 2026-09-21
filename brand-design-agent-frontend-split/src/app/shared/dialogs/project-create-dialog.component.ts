import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface ProjectCreateDialogResult {
  name: string;
  description: string;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>New project</h2>
    <mat-dialog-content>
      <p class="dialog-subtitle">Name your workspace and describe what you're building.</p>
      <mat-form-field appearance="outline">
        <mat-label>Project name</mat-label>
        <input matInput [(ngModel)]="name" (keydown.enter)="submit()" placeholder="e.g. SaaS landing page">
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>Description</mat-label>
        <textarea matInput rows="3" [(ngModel)]="description" placeholder="e.g. Marketing site with pricing, features and a signup flow"></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="dialogRef.close()">Cancel</button>
      <button mat-flat-button class="dialog-purple-button" type="button" [disabled]="!name.trim()" (click)="submit()">Create</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-subtitle { margin: -8px 0 20px; color: var(--muted); font-size: 12px; }
    mat-form-field { display: block; width: 100%; margin-bottom: 8px; }
  `]
})
export class ProjectCreateDialogComponent {
  name = '';
  description = '';

  constructor(
    @Inject(MAT_DIALOG_DATA) data: Partial<ProjectCreateDialogResult>,
    readonly dialogRef: MatDialogRef<ProjectCreateDialogComponent, ProjectCreateDialogResult>
  ) {
    this.name = data.name ?? '';
    this.description = data.description ?? '';
  }

  submit(): void {
    const name = this.name.trim();
    if (name) this.dialogRef.close({ name, description: this.description.trim() });
  }
}
