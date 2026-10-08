import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { AdminService, BusinessPayload } from '../../services/admin.service';

@Component({
  selector: 'app-business-form',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="business-page">
      <header><div><span class="brand">GastroLink</span><h1>{{ businessId ? 'Editar negocio' : 'Crear negocio' }}</h1></div><a routerLink="/admin/businesses">Volver a negocios</a></header>
      <p *ngIf="error()" class="notice" role="alert">{{ error() }}</p>
      <p *ngIf="loading()">Cargando negocio…</p>
      <form *ngIf="!loading() && ready()" #form="ngForm" (ngSubmit)="save()">
        <fieldset [disabled]="saving()">
          <label>Nombre <input name="name" [(ngModel)]="draft.name" required maxlength="100" /></label>
          <label>Slug <input name="slug" [(ngModel)]="draft.slug" required maxlength="100" pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="tacos-el-pastor" /><small>Solo minúsculas, números y guiones.</small></label>
          <label>WhatsApp <input name="whatsapp" [(ngModel)]="draft.whatsapp_number" required maxlength="20" placeholder="525512345678" /></label>
          <label>URL del logo <input name="logo" [(ngModel)]="draft.logo_url" /></label>
          <label>Costo de envío <input type="number" name="deliveryFee" [(ngModel)]="draft.delivery_fee" required min="0" step="0.01" /></label>
          <label>Pedido mínimo <input type="number" name="minimumOrder" [(ngModel)]="draft.minimum_order" required min="0" step="0.01" /></label>
          <label class="check"><input type="checkbox" name="table" [(ngModel)]="draft.allows_table_order" /> Pedidos en mesa</label>
          <label class="check"><input type="checkbox" name="takeaway" [(ngModel)]="draft.allows_takeaway" /> Para llevar</label>
          <label class="check"><input type="checkbox" name="delivery" [(ngModel)]="draft.allows_delivery" /> A domicilio</label>
          <label class="check"><input type="checkbox" name="active" [(ngModel)]="draft.is_active" /> Negocio activo</label>
          <label *ngIf="!businessId">Correo del dueño inicial <input type="email" name="ownerEmail" [(ngModel)]="ownerEmail" required email /></label>
          <button type="submit" [disabled]="form.invalid || saving()">{{ saving() ? 'Guardando…' : 'Guardar negocio' }}</button>
        </fieldset>
      </form>
    </main>
  `,
  styleUrl: '../business-list/business-page.css',
})
export class BusinessFormComponent {
  private admin = inject(AdminService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  businessId = inject(ActivatedRoute).snapshot.paramMap.get('businessId');
  loading = signal(false);
  saving = signal(false);
  ready = signal(!this.businessId);
  error = signal('');
  ownerEmail = '';
  draft: BusinessPayload = { name: '', slug: '', whatsapp_number: '', logo_url: '', allows_table_order: true, allows_takeaway: true, allows_delivery: false, delivery_fee: 0, minimum_order: 0, is_active: true };

  constructor() {
    if (!this.businessId) return;
    this.loading.set(true);
    this.admin.getBusinessById(this.businessId).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.loading.set(false))).subscribe({
      next: business => {
        for (const key of Object.keys(this.draft) as (keyof BusinessPayload)[]) Object.assign(this.draft, { [key]: business[key] });
        this.ready.set(true);
      },
      error: () => this.error.set('No se pudo cargar el negocio. Regresa al listado e intenta de nuevo.'),
    });
  }
  save(): void {
    if (this.saving() || !this.ready()) return;
    this.saving.set(true); this.error.set('');
    const payload = { ...this.draft, name: this.draft.name.trim(), slug: this.draft.slug.trim(), whatsapp_number: this.draft.whatsapp_number.trim() };
    const request = this.businessId ? this.admin.updateBusiness(this.businessId, payload) : this.admin.createBusiness({ ...payload, owner_email: this.ownerEmail.trim().toLowerCase() });
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.saving.set(false))).subscribe({
      next: business => { void this.router.navigate(['/admin/businesses', business.id]); },
      error: error => this.error.set(error.status === 409 ? 'El slug ya existe o no se pudo asociar al dueño. Revisa los datos.' : 'No se pudo guardar el negocio. Tus cambios se conservan.'),
    });
  }
}
