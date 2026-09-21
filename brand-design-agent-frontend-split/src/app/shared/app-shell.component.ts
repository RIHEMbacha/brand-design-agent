import { CommonModule } from '@angular/common';
import { Component, HostListener, input, output, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ToastService } from '../core/services/toast.service';
import { ApiService } from '../core/services/api.service';
import { Router } from '@angular/router';
import { ConfirmDialogComponent } from './dialogs/confirm-dialog.component';

@Component({
  selector: 'app-shell-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, MatDialogModule],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss'
})
export class AppShellComponent {
  readonly title = input('Brand Design Agent');
  readonly subtitle = input('');
  readonly showSearch = input(false);
  readonly searchChange = output<string>();

  readonly mobileOpen = signal(false);
  readonly profileMenuOpen = signal(false);

  constructor(
    public toast: ToastService,
    private readonly api: ApiService,
    private readonly router: Router,
    private readonly dialog: MatDialog
  ) {}

  requestLogout(): void {
    this.profileMenuOpen.set(false);
    this.dialog.open(ConfirmDialogComponent, {
      width: 'min(420px, calc(100vw - 32px))',
      maxWidth: '100vw',
      data: {
        title: 'Log out?',
        message: 'You will need to sign in again to access your projects.',
        confirmLabel: 'Log out',
        danger: true
      }
    }).afterClosed().subscribe(confirmed => {
      if (confirmed) this.confirmLogout();
    });
  }

  confirmLogout(): void {
    this.api.logout().subscribe({
      next: () => this.finishLogout(),
      error: () => this.finishLogout()
    });
  }

  private finishLogout(): void {
    this.api.clearAuth();
    void this.router.navigateByUrl('/auth/login');
  }

  toggleMobileMenu(): void {
    this.mobileOpen.update(value => !value);
  }

  toggleProfileMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.profileMenuOpen.update(value => !value);
  }

  @HostListener('document:click')
  closeProfileMenu(): void {
    this.profileMenuOpen.set(false);
  }
}