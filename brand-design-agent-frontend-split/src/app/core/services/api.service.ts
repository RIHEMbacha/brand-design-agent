import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AuthResponse,
  GeneratedArtifactRecord,
  GeneratedArtifactResponse,
  ProjectFile,
  User,
} from '../models/app.models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  private authHeaders(): HttpHeaders {
    const token = localStorage.getItem('access_token');
    return token ? new HttpHeaders({ Authorization: `Bearer ${token}` }) : new HttpHeaders();
  }

  signup(email: string, password: string, name: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/auth/signup`, { email, password, name });
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/auth/login`, { email, password });
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.base}/auth/logout`, {}, { headers: this.authHeaders() });
  }

  getProjects(): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/projects`, { headers: this.authHeaders() });
  }

  createProject(name: string, description: string) {
    return this.http.post<any>(`${this.base}/projects`, { name, description }, { headers: this.authHeaders() });
  }

  deleteProject(projectId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/projects/${projectId}`, { headers: this.authHeaders() });
  }

  getProjectDocuments(projectId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.base}/projects/${projectId}/documents`, { headers: this.authHeaders() });
  }

  uploadDocument(projectId: string, file: File): Observable<ProjectFile> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<ProjectFile>(`${this.base}/projects/${projectId}/documents`, form, { headers: this.authHeaders() });
  }

  downloadDocument(projectId: string, documentId: string): Observable<Blob> {
    return this.http.get(`${this.base}/projects/${projectId}/documents/${documentId}/download`, {
      headers: this.authHeaders(), responseType: 'blob'
    });
  }

  deleteDocument(projectId: string, documentId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/projects/${projectId}/documents/${documentId}`, { headers: this.authHeaders() });
  }

  generate(projectId: string, artifactType: string, prompt: string, name: string): Observable<GeneratedArtifactResponse> {
    return this.http.post<GeneratedArtifactResponse>(
      `${this.base}/projects/${projectId}/generate`,
      { artifact_type: artifactType, prompt, name },
      { headers: this.authHeaders() }
    );
  }

  getArtifacts(projectId: string): Observable<GeneratedArtifactRecord[]> {
    return this.http.get<GeneratedArtifactRecord[]>(`${this.base}/projects/${projectId}/artifacts`, { headers: this.authHeaders() });
  }

  getArtifact(projectId: string, artifactId: string): Observable<GeneratedArtifactRecord> {
    return this.http.get<GeneratedArtifactRecord>(`${this.base}/projects/${projectId}/artifacts/${artifactId}`, { headers: this.authHeaders() });
  }

  deleteArtifact(projectId: string, artifactId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/projects/${projectId}/artifacts/${artifactId}`, { headers: this.authHeaders() });
  }

  downloadArtifactZip(projectId: string, artifactId: string): Observable<Blob> {
    return this.http.get(`${this.base}/projects/${projectId}/artifacts/${artifactId}/zip`, {
      headers: this.authHeaders(), responseType: 'blob'
    });
  }

  saveAuth(response: AuthResponse): void {
    localStorage.setItem('access_token', response.access_token);
    localStorage.setItem('current_user', JSON.stringify(response.user));
  }

  clearAuth(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('current_user');
  }

  get currentUser(): User | null {
    const raw = localStorage.getItem('current_user');
    if (!raw) return null;
    try { return JSON.parse(raw) as User; } catch { return null; }
  }

  get isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token');
  }
}
