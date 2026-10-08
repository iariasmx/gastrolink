import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-business-list',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="business-page">
      <header>
        <div><span class="brand">GastroLink</span><h1>{{ auth.isSuperadmin() ? 'Todos los negocios' : 'Mis negocios' }}</h1><p>Selecciona el negocio que quieres administrar.</p></div>
        <div class="actions"><a *ngIf="auth.isSuperadmin()" routerLink="/admin/businesses/new">Crear negocio</a><button (click)="auth.logout()">Cerrar sesión</button></div>
      </header>
      <p *ngIf="accessDenied" role="alert" class="notice">No tienes permiso para administrar ese negocio o realizar esa acción.</p>
      <label class="search">Buscar negocios <input type="search" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Nombre o slug" /></label>
      <p *ngIf="!auth.businesses().length">No tienes negocios disponibles. Contacta al administrador para solicitar acceso.</p>
      <p *ngIf="auth.businesses().length && !filtered().length">No hay negocios que coincidan con tu búsqueda.</p>
      <section class="business-grid" aria-label="Negocios">
        <article *ngFor="let business of filtered()">
          <div class="heading"><h2>{{ business.name }}</h2><span>{{ business.is_active ? 'Activo' : 'Inactivo' }}</span></div>
          <p>/menu/{{ business.slug }}</p>
          <div class="actions">
            <a *ngIf="auth.canManageBusiness(business.id)" [routerLink]="['/admin/businesses', business.id]">Entrar al panel</a>
            <span *ngIf="!auth.canManageBusiness(business.id)">Sin permiso de administración</span>
            <a *ngIf="auth.isSuperadmin()" [routerLink]="['/admin/businesses', business.id, 'edit']">Editar negocio</a>
            <a *ngIf="business.is_active" [routerLink]="['/menu', business.slug]">Menú público</a>
          </div>
        </article>
      </section>
    </main>
  `,
  styleUrl: './business-page.css',
})
export class BusinessListComponent {
  auth = inject(AuthService);
  accessDenied = inject(ActivatedRoute).snapshot.queryParamMap.get('accessDenied') === 'true';
  query = signal('');
  filtered = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.auth.businesses().filter(b => `${b.name} ${b.slug}`.toLocaleLowerCase().includes(query));
  });
}
