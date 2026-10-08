import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-container">
      <div class="glass-card">
        <div class="brand-header">
          <span class="brand-logo">⚡</span>
          <h1>GastroLink</h1>
          <p class="subtitle">Acceso Administrativo para Restaurantes</p>
        </div>

        <form (ngSubmit)="onLogin()" class="login-form">
          <div *ngIf="errorMessage" class="error-banner">
            ⚠️ {{ errorMessage }}
          </div>

          <div class="form-group">
            <label>Correo Electrónico</label>
            <input 
              type="email" 
              [(ngModel)]="email" 
              name="email"
              autocomplete="username" 
              placeholder="restaurante@ejemplo.com" 
              required 
            />
          </div>

          <div class="form-group">
            <label>Contraseña</label>
            <input 
              type="password" 
              [(ngModel)]="password" 
              name="password"
              autocomplete="current-password" 
              placeholder="••••••••" 
              required 
            />
          </div>

          <button type="submit" class="submit-btn" [disabled]="loading">
            <span *ngIf="!loading">Ingresar al Panel Admin</span>
            <span *ngIf="loading">Validando...</span>
          </button>
        </form>

        <div class="card-footer">
          <a href="/menu/tacos-el-pastor" class="back-link">← Volver al Menú Público</a>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
      font-family: system-ui, -apple-system, sans-serif;
      padding: 1.5rem;
    }

    .glass-card {
      width: 100%;
      max-width: 420px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(16px);
      border-radius: 24px;
      padding: 2.5rem 2rem;
      box-shadow: 0 20px 40px rgba(0,0,0,0.35);
      border: 1px solid rgba(255,255,255,0.2);
    }

    .brand-header {
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .brand-logo {
      font-size: 2.75rem;
      display: block;
      margin-bottom: 0.25rem;
    }

    .brand-header h1 {
      margin: 0;
      font-size: 1.75rem;
      font-weight: 800;
      color: #0f172a;
    }

    .subtitle {
      margin: 0.25rem 0 0;
      font-size: 0.85rem;
      color: #64748b;
    }

    .demo-banner {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
      padding: 0.75rem 1rem;
      border-radius: 12px;
      font-size: 0.82rem;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      margin-bottom: 1.5rem;
    }

    .demo-banner code {
      background: #dcfce7;
      padding: 0.15rem 0.35rem;
      border-radius: 4px;
      font-weight: 700;
    }

    .login-form {
      display: flex;
      flex-direction: column;
      gap: 1.1rem;
    }

    .error-banner {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #991b1b;
      padding: 0.75rem;
      border-radius: 10px;
      font-size: 0.85rem;
      text-align: center;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .form-group label {
      font-size: 0.82rem;
      font-weight: 700;
      color: #334155;
    }

    .form-group input {
      padding: 0.75rem 1rem;
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      font-size: 0.95rem;
      outline: none;
      transition: all 0.2s;
    }

    .form-group input:focus {
      border-color: #25d366;
      box-shadow: 0 0 0 3px rgba(37, 211, 102, 0.15);
    }

    .submit-btn {
      margin-top: 0.5rem;
      padding: 0.9rem;
      background: #0f172a;
      color: #ffffff;
      border: none;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
    }

    .submit-btn:hover:not(:disabled) {
      background: #25d366;
      transform: translateY(-1px);
    }

    .submit-btn:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }

    .card-footer {
      margin-top: 1.5rem;
      text-align: center;
    }

    .back-link {
      color: #64748b;
      font-size: 0.85rem;
      text-decoration: none;
      font-weight: 600;
    }

    .back-link:hover {
      color: #0f172a;
    }
  `]
})
export class LoginComponent {
  authService = inject(AuthService);
  router = inject(Router);
  route = inject(ActivatedRoute);

  email = '';
  password = '';
  loading = false;
  errorMessage = '';

  onLogin(): void {
    if (!this.email || !this.password) {
      this.errorMessage = 'Por favor ingresa tu correo y contraseña.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    this.authService.login(this.email, this.password).subscribe(success => {
      this.loading = false;
      if (success) {
        const target = this.route.snapshot.queryParamMap.get('returnUrl');
        void this.router.navigateByUrl(target && /^\/admin(?:\/|$)/.test(target) ? target : '/admin');
      } else {
        this.errorMessage = 'Credenciales inválidas. Por favor verifica tu correo y contraseña.';
      }
    });
  }
}
