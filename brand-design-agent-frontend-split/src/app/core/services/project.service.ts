import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { GeneratedArtifactRecord, InterfaceScreen, Project, ProjectFile } from '../models/app.models';

@Injectable({ providedIn: 'root' })
export class ProjectService {
  private readonly api = inject(ApiService);
  private readonly projectsState = signal<Project[]>([]);
  private readonly files = new Map<string, ProjectFile[]>();
  private readonly artifacts = new Map<string, GeneratedArtifactRecord[]>();

  projects() { return this.projectsState(); }

  async loadProjects(): Promise<Project[]> {
    const rows = await firstValueFrom(this.api.getProjects());
    const projects = rows.map((row, index) => this.mapProject(row, index));
    this.projectsState.set(projects);
    return projects;
  }

  getProject(id: string): Project | undefined {
    return this.projectsState().find(project => project.id === id);
  }

  async loadProject(id: string): Promise<Project | undefined> {
    const existing = this.getProject(id);
    if (existing) return existing;
    const projects = await this.loadProjects();
    return projects.find(project => project.id === id);
  }

  async createProject(name: string, description: string): Promise<Project> {
    const row = await firstValueFrom(this.api.createProject(name.trim(), description.trim()));
    const project = this.mapProject(row, this.projectsState().length);
    this.projectsState.update(items => [project, ...items]);
    return project;
  }

  async deleteProject(projectId: string): Promise<void> {
    await firstValueFrom(this.api.deleteProject(projectId));
    this.projectsState.update(items => items.filter(project => project.id !== projectId));
    this.files.delete(projectId);
    this.artifacts.delete(projectId);
  }

  async loadFiles(projectId: string): Promise<ProjectFile[]> {
    const rows = await firstValueFrom(this.api.getProjectDocuments(projectId));
    const files = rows.map(row => ({
      id: row.id,
      name: row.filename ?? row.name ?? 'file',
      size: Number(row.size_bytes ?? row.size ?? 0),
      type: this.extension(row.filename ?? row.name ?? ''),
      mimeType: row.mime_type,
      storagePath: row.storage_path,
      status: row.status,
    }));
    this.files.set(projectId, files);
    return files;
  }

  getFiles(projectId: string): ProjectFile[] { return [...(this.files.get(projectId) ?? [])]; }

  async uploadFiles(projectId: string, selected: File[]): Promise<ProjectFile[]> {
    for (const file of selected) await firstValueFrom(this.api.uploadDocument(projectId, file));
    return this.loadFiles(projectId);
  }

  async deleteFile(projectId: string, fileId: string): Promise<void> {
    await firstValueFrom(this.api.deleteDocument(projectId, fileId));
    this.files.set(projectId, this.getFiles(projectId).filter(file => file.id !== fileId));
  }

  async loadArtifacts(projectId: string): Promise<GeneratedArtifactRecord[]> {
    const artifacts = await firstValueFrom(this.api.getArtifacts(projectId));
    this.artifacts.set(projectId, artifacts);
    return artifacts;
  }

  getArtifacts(projectId: string): GeneratedArtifactRecord[] { return [...(this.artifacts.get(projectId) ?? [])]; }

  getInterfaces(projectId: string): InterfaceScreen[] {
    const artifacts = this.getArtifacts(projectId);
    return artifacts.map((artifact, index) => ({
      id: artifact.id,
      artifactId: artifact.id,
      name: artifact.name || artifact.output?.title || artifact.artifact_type || artifact.prompt || `Interface ${index + 1}`,
      type: 'Desktop',
    }));
  }

  async generate(projectId: string, prompt: string, artifactType: string, name: string): Promise<GeneratedArtifactRecord> {
    const response = await firstValueFrom(this.api.generate(projectId, artifactType, prompt, name));
    const current = this.getArtifacts(projectId);
    const record: GeneratedArtifactRecord = {
      id: response.artifact_id,
      project_id: response.project_id,
      artifact_type: response.artifact_type,
      name: response.name,
      output: response.output,
    };
    this.artifacts.set(projectId, [record, ...current.filter(item => item.id !== record.id)]);
    return record;
  }

  async getArtifact(projectId: string, artifactId: string, refresh = false): Promise<GeneratedArtifactRecord> {
    if (!refresh) {
      const cached = this.getArtifacts(projectId).find(item => item.id === artifactId);
      if (cached) return cached;
    }
    const artifact = await firstValueFrom(this.api.getArtifact(projectId, artifactId));
    this.artifacts.set(projectId, [artifact, ...this.getArtifacts(projectId).filter(item => item.id !== artifact.id)]);
    return artifact;
  }

  async deleteArtifact(projectId: string, artifactId: string): Promise<void> {
    await firstValueFrom(this.api.deleteArtifact(projectId, artifactId));
    this.artifacts.set(projectId, this.getArtifacts(projectId).filter(artifact => artifact.id !== artifactId));
  }

  private mapProject(row: any, index: number): Project {
    return {
      id: String(row.id),
      name: row.name ?? 'Untitled project',
      description: row.description ?? '',
      updatedAt: this.formatDate(row.updated_at ?? row.created_at),
      interfaces: Number(row.interfaces ?? row.interface_count ?? 0),
      files: Number(row.files ?? row.file_count ?? 0),
      accent: (['p1', 'p2', 'p3'] as const)[index % 3],
    };
  }

  private formatDate(value: unknown): string {
    if (!value) return 'Recently';
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  private extension(name: string): string {
    const ext = name.split('.').pop()?.toUpperCase();
    return ext && ext.length <= 5 ? ext : 'FILE';
  }
}
