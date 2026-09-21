import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string | null>(null);
  private timeout?: ReturnType<typeof setTimeout>;

  show(message: string) {
    this.message.set(message);
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.message.set(null), 2500);
  }
}
