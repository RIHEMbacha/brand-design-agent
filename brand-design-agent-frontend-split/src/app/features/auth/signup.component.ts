import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';

@Component({ standalone: true, imports: [CommonModule, ReactiveFormsModule, RouterLink], templateUrl: './signup.component.html', styleUrl: './signup.component.scss' })
export class SignupComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  loading = false;
  error = '';
  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]]
  });

  get passwordMismatch() { return this.form.controls.password.value !== this.form.controls.confirmPassword.value && this.form.controls.confirmPassword.value.length > 0; }

  submit() {
    if (this.form.invalid || this.passwordMismatch || this.loading) return;
    this.loading = true; this.error = '';
    const { name, email, password } = this.form.getRawValue();
    this.api.signup(email, password, name).subscribe({
      next: response => { this.api.saveAuth(response); this.toast.show('Account created successfully.'); void this.router.navigateByUrl('/projects'); },
      error: err => { this.error = err?.error?.detail ?? 'Unable to create account.'; this.loading = false; },
      complete: () => this.loading = false,
    });
  }
}
