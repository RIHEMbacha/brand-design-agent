import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';

@Component({ standalone: true, imports: [CommonModule, ReactiveFormsModule, RouterLink], templateUrl: './login.component.html', styleUrl: './login.component.scss' })
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  loading = false;
  error = '';
  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  submit() {
    if (this.form.invalid || this.loading) return;
    this.loading = true; this.error = '';
    const { email, password } = this.form.getRawValue();
    this.api.login(email, password).subscribe({
      next: response => { this.api.saveAuth(response); this.toast.show('Signed in successfully.'); void this.router.navigateByUrl('/projects'); },
      error: err => { this.error = err?.error?.detail ?? 'Unable to sign in.'; this.loading = false; },
      complete: () => this.loading = false,
    });
  }
}
