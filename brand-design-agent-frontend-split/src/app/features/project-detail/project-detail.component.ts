import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AppShellComponent } from '../../shared/app-shell.component';
import { ReferenceFilesDialogComponent } from '../../shared/dialogs/reference-files-dialog.component';
import { InterfaceScreen, Project, ProjectFile } from '../../core/models/app.models';
import { ProjectService } from '../../core/services/project.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppShellComponent, MatDialogModule],
  templateUrl: './project-detail.component.html',
  styleUrl: './project-detail.component.scss'
})
export class ProjectDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  readonly projectService = inject(ProjectService);
  readonly toast = inject(ToastService);
  readonly router = inject(Router);
  readonly dialog = inject(MatDialog);

  project?: Project;
  interfaces: InterfaceScreen[] = [];
  files: ProjectFile[] = [];
  activeInterface?: InterfaceScreen;
  prompt = '';
  addingInterface = signal(false);
  dragging = signal(false);
  showingFiles = signal(false);
  tab = signal<'design' | 'code' | 'json'>('design');
  loading = false;
  error = '';

  suggestions = [
    'Premium SaaS dashboard with soft gradients',
    'Minimal ecommerce homepage with strong CTA',
    'Calm mobile booking flow with rounded cards'
  ];

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    const interfaceName = this.route.snapshot.queryParamMap.get('interfaceName');
    try {
      this.project = await this.projectService.loadProject(id);
      if (!this.project) return;
      await Promise.all([this.projectService.loadArtifacts(id), this.projectService.loadFiles(id)]);
      this.interfaces = this.projectService.getInterfaces(id);
      this.files = this.projectService.getFiles(id);
      const interfaceId = this.route.snapshot.queryParamMap.get('interface');
      this.activeInterface = this.interfaces.find(item => item.id === interfaceId) ?? (interfaceName ? { id: `local-${interfaceName}`, name: interfaceName, type: 'Desktop' } : this.interfaces[0]);
      if (interfaceName && !this.interfaces.some(item => item.name === interfaceName)) this.interfaces = [{ id: `local-${interfaceName}`, name: interfaceName, type: 'Desktop' }, ...this.interfaces];
      this.prompt = 'Create a premium interface with the visual direction from the project references: white surfaces, rounded cards, soft violet gradients, clean typography and a clear primary action.';
    } catch (err: any) { this.error = err?.error?.detail ?? 'Unable to load project.'; }
  }

  selectInterface(screen: InterfaceScreen) { this.activeInterface = screen; this.tab.set('design'); }

  addInterface() {
    if (!this.project || !this.newInterfaceName.trim()) return;
    const name = this.newInterfaceName.trim();
    this.newInterfaceName = ''; this.addingInterface.set(false);
    this.activeInterface = { id: `local-${crypto.randomUUID()}`, name, type: 'Desktop' };
    this.interfaces = [this.activeInterface, ...this.interfaces];
    this.toast.show(`Interface “${name}” added.`);
  }

  newInterfaceName = '';
  cancelAddInterface() { this.newInterfaceName = ''; this.addingInterface.set(false); }

  async regenerate() {
    if (!this.project || !this.activeInterface || this.loading) return;
    this.loading = true; this.error = '';
    try {
      const artifact = await this.projectService.generate(this.project.id, this.prompt, 'html', this.activeInterface.name);
      this.tab.set('design');
      await this.router.navigate(['/projects', this.project.id, 'workspace', 'result'], { queryParams: { artifactId: artifact.id, interface: this.activeInterface.id } });
    } catch (err: any) { this.error = err?.error?.detail ?? 'Generation failed.'; this.toast.show(this.error); }
    finally { this.loading = false; }
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
    try { await this.projectService.uploadFiles(this.project.id, selected); this.files = this.projectService.getFiles(this.project.id); this.toast.show(`${selected.length} file${selected.length > 1 ? 's' : ''} added.`); }
    catch (err: any) { this.toast.show(err?.error?.detail ?? 'Unable to upload file.'); }
    finally { this.loading = false; }
  }

  formatSize(size: number) { if (size < 1024) return `${size} B`; if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`; return `${(size / (1024 * 1024)).toFixed(1)} MB`; }

}

function createStoredZip(files: Array<{ name: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length + data.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true); view.setUint16(8, 0, true);
    view.setUint16(10, 0, true); view.setUint16(12, 0, true); view.setUint32(14, crc, true); view.setUint32(18, data.length, true); view.setUint32(22, data.length, true); view.setUint16(26, name.length, true); view.setUint16(28, 0, true);
    local.set(name, 30); local.set(data, 30 + name.length); chunks.push(local);

    const dir = new Uint8Array(46 + name.length); const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 20, true); dv.setUint16(8, 0x800, true); dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true); dv.setUint16(14, 0, true); dv.setUint32(16, crc, true); dv.setUint32(20, data.length, true); dv.setUint32(24, data.length, true); dv.setUint16(28, name.length, true); dv.setUint16(30, 0, true); dv.setUint16(32, 0, true); dv.setUint16(34, 0, true); dv.setUint16(36, 0, true); dv.setUint32(38, 0, true); dv.setUint32(42, offset, true); dir.set(name, 46); central.push(dir);
    offset += local.length;
  }
  const centralOffset = offset; let centralSize = 0; for (const dir of central) { chunks.push(dir); centralSize += dir.length; }
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, centralSize, true); ev.setUint32(16, centralOffset, true); ev.setUint16(20, 0, true); chunks.push(end);
  const result = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0)); let pointer = 0; for (const chunk of chunks) { result.set(chunk, pointer); pointer += chunk.length; } return result;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
