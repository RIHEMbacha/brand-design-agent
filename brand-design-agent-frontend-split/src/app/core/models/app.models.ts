export interface User {
  id: string;
  email: string;
  name?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type?: string;
  user: User;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  interfaces: number;
  files: number;
  accent: 'p1' | 'p2' | 'p3';
}

export interface ProjectFile {
  id?: string;
  name: string;
  size: number;
  type: string;
  mimeType?: string;
  status?: string;
  storagePath?: string;
}

export interface InterfaceScreen {
  id: string;
  name: string;
  type: string;
  artifactId?: string;
}

export interface GeneratedFile {
  name: string;
  content?: string;
  language?: string;
  path?: string;
}

export interface GeneratedUIOutput {
  artifact_type?: string;
  title?: string;
  description?: string;
  primaryColor?: string;
  components?: string[];
  files?: GeneratedFile[];
  warnings?: string[];
  [key: string]: unknown;
}

export interface GeneratedArtifactRecord {
  id: string;
  project_id: string;
  artifact_type: string;
  name?: string;
  prompt?: string;
  files?: GeneratedFile[];
  output: GeneratedUIOutput;
  zip_storage_path?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface GeneratedArtifactResponse {
  artifact_id: string;
  project_id: string;
  artifact_type: string;
  name: string;
  output: GeneratedUIOutput;
}

export interface GeneratedResult {
  design: {
    title: string;
    description: string;
    primaryColor: string;
    components: string[];
  };
  code: {
    language: string;
    fileName: string;
    content: string;
  };
  zipName: string;
  generatedAt: string;
  artifactId?: string;
  raw?: GeneratedArtifactRecord;
}
