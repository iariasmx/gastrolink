import { Component, OnInit, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MenuService } from '../../services/menu.service';
import { Restaurant, CategoryWithProducts, Product } from '../../models/restaurant.model';

import { AuthService } from '../../services/auth.service';
import { AdminService } from '../../services/admin.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="admin-layout">
      <!-- Admin Sidebar -->
      <aside class="admin-sidebar">
        <div class="sidebar-brand">
          <span class="brand-logo">⚡</span>
          <div>
            <h2>GastroLink</h2>
            <span class="admin-badge">Panel Admin</span>
          </div>
        </div>

        <nav class="sidebar-menu">
          <button 
            [class.active]="activeTab() === 'overview'" 
            (click)="activeTab.set('overview')">
            📊 Resumen & Código QR
          </button>
          <button 
            [class.active]="activeTab() === 'menu'" 
            (click)="activeTab.set('menu')">
            🍽️ Gestión de Menú (CRUD)
          </button>
          <button 
            [class.active]="activeTab() === 'settings'" 
            (click)="activeTab.set('settings')">
            ⚙️ Configuración del Negocio
          </button>
        </nav>

        <div class="sidebar-footer">
          <div class="user-info-box" *ngIf="authService.currentUserEmail()">
            <span class="user-icon">👤</span>
            <span class="user-email">{{ authService.currentUserEmail() }}</span>
          </div>
          <a [href]="'/menu/' + (restaurant()?.slug || 'tacos-el-pastor')" target="_blank" class="preview-btn">
            🔗 Ver Menú Público ↗
          </a>
          <button class="logout-btn" (click)="authService.logout()">
            🚪 Cerrar Sesión
          </button>
        </div>
      </aside>

      <!-- Admin Main Content -->
      <main class="admin-main">
        <!-- Header Bar -->
        <header class="admin-header">
          <div>
            <h1>{{ restaurant()?.name || 'Mi Restaurante' }}</h1>
            <p class="subtitle">Administra tu catálogo digital y obtén tu código QR imprimible</p>
          </div>
          <div class="slug-pill">
            <span>Slug actual:</span>
            <code>/menu/{{ restaurant()?.slug }}</code>
          </div>
        </header>

        <!-- Tab 1: Overview & QR Generator -->
        <section *ngIf="activeTab() === 'overview'" class="tab-content">
          <div class="grid-2col">
            <!-- QR Card -->
            <div class="card qr-card">
              <div class="card-header">
                <h3>📱 Código QR para Mesas y Mostrador</h3>
                <p>Escanea este código con cualquier cámara móvil para acceder al menú interactivo.</p>
              </div>

              <div class="qr-preview-box">
                <img 
                  [src]="getQrUrl()" 
                  alt="Código QR del Menú Digital" 
                  class="qr-image" 
                />
                <p class="qr-target-url">{{ getMenuFullUrl() }}</p>
              </div>

              <div class="qr-actions">
                <button class="btn btn-primary" (click)="downloadQr()">
                  ⬇️ Descargar QR en Alta Resolución
                </button>
                <button class="btn btn-secondary" (click)="printQr()">
                  🖨️ Imprimir Cartel de Mesa
                </button>
              </div>
            </div>

            <!-- Fast Stats -->
            <div class="stats-column">
              <div class="card stat-box">
                <span class="stat-icon">📁</span>
                <div>
                  <h4>Categorías Activas</h4>
                  <p class="stat-value">{{ categories().length }}</p>
                </div>
              </div>

              <div class="card stat-box">
                <span class="stat-icon">🌮</span>
                <div>
                  <h4>Total de Platillos</h4>
                  <p class="stat-value">{{ getTotalProducts() }}</p>
                </div>
              </div>

              <div class="card stat-box">
                <span class="stat-icon">💬</span>
                <div>
                  <h4>Número de Pedidos WhatsApp</h4>
                  <p class="stat-value">{{ restaurant()?.whatsapp_number }}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Tab 2: Menu CRUD -->
        <section *ngIf="activeTab() === 'menu'" class="tab-content">
          <div class="card">
            <div class="card-header flex-between">
              <div>
                <h3>🍽️ Administración del Menú</h3>
                <p>Agrega, edita información, cambia precios o deshabilita platillos en tiempo real.</p>
              </div>
              <button class="btn btn-success" (click)="openAddProductModal()">
                + Nuevo Platillo
              </button>
            </div>

            <!-- Categories List -->
            <div *ngFor="let cat of categories()" class="crud-category-block">
              <div class="category-block-header">
                <h4>{{ cat.name }}</h4>
                <span class="products-count">{{ cat.products.length }} productos</span>
              </div>

              <div class="crud-products-list">
                <div *ngFor="let prod of cat.products" class="crud-product-item">
                  <img [src]="prod.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80'" (error)="onImageError($event)" [alt]="prod.name" class="crud-thumb" />
                  
                  <div class="crud-item-info">
                    <h5>{{ prod.name }}</h5>
                    <p class="crud-item-desc">{{ prod.description }}</p>
                    <span class="crud-item-price">\${{ prod.price | number:'1.2-2' }}</span>
                  </div>

                  <div class="crud-item-actions">
                    <button 
                      class="toggle-status-btn"
                      [class.available]="prod.is_available"
                      (click)="toggleAvailability(prod)">
                      {{ prod.is_available ? '✅ Disponible' : '❌ Agotado' }}
                    </button>
                    <button class="btn-icon btn-edit" (click)="openEditProductModal(prod)" title="Editar Platillo">✏️</button>
                    <button class="btn-icon btn-delete" (click)="deleteProduct(prod.id)" title="Eliminar Platillo">🗑️</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Tab 3: Restaurant Settings -->
        <section *ngIf="activeTab() === 'settings'" class="tab-content">
          <div class="card max-w-700">
            <h3>⚙️ Configuración General del Restaurante</h3>
            <form (ngSubmit)="saveSettings()" class="settings-form">
              <div class="form-group">
                <label>Nombre del Restaurante</label>
                <input type="text" [(ngModel)]="editName" name="name" required />
              </div>

              <div class="form-group">
                <label>Slug Único (URL del Menú)</label>
                <input type="text" [(ngModel)]="editSlug" name="slug" required />
              </div>

              <div class="form-group">
                <label>Teléfono de WhatsApp (con clave de país)</label>
                <input type="text" [(ngModel)]="editWhatsapp" name="whatsapp" placeholder="Ej. 525512345678" required />
              </div>

              <div class="form-group">
                <label>URL del Logo</label>
                <input type="text" [(ngModel)]="editLogo" name="logo" placeholder="https://..." />
              </div>

              <div class="form-group">
                <label>Costo de Envío ($ MXN)</label>
                <input type="number" [(ngModel)]="editDeliveryFee" name="deliveryFee" step="5" />
              </div>

              <div class="form-checkboxes">
                <label>
                  <input type="checkbox" [(ngModel)]="editAllowsTable" name="allowsTable" />
                  Permitir Pedidos en Mesa
                </label>
                <label>
                  <input type="checkbox" [(ngModel)]="editAllowsTakeaway" name="allowsTakeaway" />
                  Permitir Pedidos Para Llevar
                </label>
                <label>
                  <input type="checkbox" [(ngModel)]="editAllowsDelivery" name="allowsDelivery" />
                  Permitir Servicio a Domicilio
                </label>
              </div>

              <button type="submit" class="btn btn-primary">
                💾 Guardar Cambios
              </button>
            </form>
          </div>
        </section>
      </main>

      <!-- Modal para Agregar Platillo -->
      <div *ngIf="showAddModal" class="modal-overlay" (click)="showAddModal = false">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h3>+ Agregar Nuevo Platillo</h3>
          <div class="form-group">
            <label>Categoría</label>
            <select [(ngModel)]="newProductCategoryId">
              <option *ngFor="let c of categories()" [value]="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>Nombre del Platillo</label>
            <input type="text" [(ngModel)]="newProductName" placeholder="Ej. Quesadilla de Arrachera" />
          </div>
          <div class="form-group">
            <label>Precio ($ MXN)</label>
            <input type="number" [(ngModel)]="newProductPrice" placeholder="0.00" />
          </div>
          <div class="form-group">
            <label>Descripción</label>
            <textarea [(ngModel)]="newProductDescription" rows="3" placeholder="Ingredientes o especificaciones"></textarea>
          </div>
          <div class="form-group">
            <label>URL de Imagen</label>
            <input type="text" [(ngModel)]="newProductImageUrl" placeholder="https://..." />
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" (click)="showAddModal = false">Cancelar</button>
            <button class="btn btn-success" (click)="saveNewProduct()">Guardar Platillo</button>
          </div>
        </div>
      </div>

      <!-- Modal para Editar Platillo -->
      <div *ngIf="showEditModal" class="modal-overlay" (click)="showEditModal = false">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h3>✏️ Editar Informacion del Platillo</h3>
          <div class="form-group">
            <label>Categoría</label>
            <select [(ngModel)]="editProductCategoryId">
              <option *ngFor="let c of categories()" [value]="c.id">{{ c.name }}</option>
            </select>
          </div>
          <div class="form-group">
            <label>Nombre del Platillo</label>
            <input type="text" [(ngModel)]="editProductName" placeholder="Nombre del producto" />
          </div>
          <div class="form-group">
            <label>Precio ($ MXN)</label>
            <input type="number" [(ngModel)]="editProductPrice" placeholder="0.00" />
          </div>
          <div class="form-group">
            <label>Descripción</label>
            <textarea [(ngModel)]="editProductDescription" rows="3" placeholder="Descripción del platillo"></textarea>
          </div>
          <div class="form-group">
            <label>URL de Imagen</label>
            <input type="text" [(ngModel)]="editProductImageUrl" placeholder="https://..." />
          </div>

          <div class="modal-actions">
            <button class="btn btn-secondary" (click)="showEditModal = false">Cancelar</button>
            <button class="btn btn-primary" (click)="saveEditedProduct()">💾 Guardar Cambios</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .admin-layout {
      display: flex;
      min-height: 100vh;
      background-color: #f1f5f9;
      font-family: system-ui, -apple-system, sans-serif;
    }

    .admin-sidebar {
      width: 270px;
      background: #0f172a;
      color: #ffffff;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .brand-logo {
      font-size: 2rem;
    }

    .sidebar-brand h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    .admin-badge {
      font-size: 0.75rem;
      color: #25d366;
      font-weight: 700;
      text-transform: uppercase;
    }

    .sidebar-menu {
      margin-top: 2rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      flex: 1;
    }

    .sidebar-menu button {
      background: transparent;
      border: none;
      color: #94a3b8;
      text-align: left;
      padding: 0.85rem 1rem;
      border-radius: 10px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .sidebar-menu button:hover, .sidebar-menu button.active {
      background: #1e293b;
      color: #ffffff;
    }

    .sidebar-menu button.active {
      border-left: 4px solid #25d366;
    }

    .user-info-box {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.8rem;
      color: #94a3b8;
      margin-bottom: 0.75rem;
      background: #1e293b;
      padding: 0.5rem 0.75rem;
      border-radius: 8px;
    }

    .user-email {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .preview-btn {
      display: block;
      background: #15803d;
      color: #ffffff;
      text-align: center;
      padding: 0.75rem;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 700;
      font-size: 0.9rem;
      margin-bottom: 0.5rem;
    }

    .logout-btn {
      width: 100%;
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
      padding: 0.65rem;
      border-radius: 10px;
      font-size: 0.85rem;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s;
    }

    .logout-btn:hover {
      background: #dc2626;
      color: #ffffff;
    }

    .admin-main {
      flex: 1;
      padding: 2rem;
      overflow-y: auto;
    }

    .admin-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
    }

    .admin-header h1 {
      margin: 0;
      font-size: 1.75rem;
      color: #0f172a;
    }

    .subtitle {
      margin: 0.25rem 0 0;
      color: #64748b;
      font-size: 0.95rem;
    }

    .slug-pill {
      background: #ffffff;
      padding: 0.5rem 1rem;
      border-radius: 20px;
      border: 1px solid #cbd5e1;
      font-size: 0.85rem;
      color: #475569;
    }

    .slug-pill code {
      font-weight: 700;
      color: #059669;
    }

    .card {
      background: #ffffff;
      border-radius: 16px;
      padding: 1.5rem;
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.03);
    }

    .grid-2col {
      display: grid;
      grid-template-columns: 1fr 300px;
      gap: 1.5rem;
    }

    .qr-preview-box {
      text-align: center;
      padding: 1.5rem;
      background: #f8fafc;
      border-radius: 16px;
      border: 2px dashed #cbd5e1;
      margin: 1.5rem 0;
    }

    .qr-image {
      width: 220px;
      height: 220px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }

    .qr-target-url {
      font-size: 0.85rem;
      color: #64748b;
      margin-top: 0.75rem;
      font-family: monospace;
    }

    .qr-actions {
      display: flex;
      gap: 1rem;
    }

    .stat-box {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .stat-icon {
      font-size: 2rem;
      background: #f0fdf4;
      padding: 0.75rem;
      border-radius: 12px;
    }

    .stat-value {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 800;
      color: #0f172a;
    }

    .flex-between {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .crud-category-block {
      margin-top: 1.5rem;
    }

    .category-block-header {
      display: flex;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      background: #f8fafc;
      border-radius: 10px;
      font-weight: 700;
      margin-bottom: 0.75rem;
    }

    .crud-products-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .crud-product-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
    }

    .crud-thumb {
      width: 55px;
      height: 55px;
      border-radius: 8px;
      object-fit: cover;
    }

    .crud-item-info {
      flex: 1;
    }

    .crud-item-info h5 {
      margin: 0;
      font-size: 0.95rem;
    }

    .crud-item-desc {
      margin: 0.2rem 0;
      font-size: 0.8rem;
      color: #64748b;
    }

    .crud-item-price {
      font-weight: 700;
      color: #16a34a;
      font-size: 0.85rem;
    }

    .crud-item-actions {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .toggle-status-btn {
      padding: 0.4rem 0.75rem;
      border-radius: 8px;
      border: none;
      font-size: 0.8rem;
      font-weight: 700;
      cursor: pointer;
      background: #fee2e2;
      color: #dc2626;
    }

    .toggle-status-btn.available {
      background: #dcfce7;
      color: #15803d;
    }

    .btn {
      padding: 0.65rem 1.25rem;
      border-radius: 10px;
      border: none;
      font-weight: 700;
      cursor: pointer;
    }

    .btn-primary { background: #0f172a; color: #ffffff; }
    .btn-secondary { background: #e2e8f0; color: #334155; }
    .btn-success { background: #25d366; color: #ffffff; }
    .btn-icon {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 0.4rem 0.6rem;
      font-size: 0.9rem;
      cursor: pointer;
      transition: background 0.15s;
    }

    .btn-icon:hover {
      background: #e2e8f0;
    }

    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-card {
      background: #ffffff;
      width: 100%;
      max-width: 480px;
      border-radius: 16px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .form-group input, .form-group select, .form-group textarea {
      padding: 0.65rem;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 0.9rem;
    }

    .form-checkboxes {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin: 1rem 0;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }
  `]
})
export class AdminComponent implements OnInit {
  menuService = inject(MenuService);
  authService = inject(AuthService);
  adminService = inject(AdminService);

  activeTab = signal<'overview' | 'menu' | 'settings'>('overview');

  restaurant = signal<Restaurant | null>(null);
  categories = signal<CategoryWithProducts[]>([]);

  // Settings form binding
  editName = '';
  editSlug = '';
  editWhatsapp = '';
  editLogo = '';
  editDeliveryFee = 0;
  editAllowsTable = true;
  editAllowsTakeaway = true;
  editAllowsDelivery = true;

  // Add Product Modal State
  showAddModal = false;
  newProductCategoryId = '';
  newProductName = '';
  newProductPrice = 0;
  newProductDescription = '';
  newProductImageUrl = '';

  // Edit Product Modal State
  showEditModal = false;
  editingProductId = '';
  editProductCategoryId = '';
  editProductName = '';
  editProductPrice = 0;
  editProductDescription = '';
  editProductImageUrl = '';

  constructor() {
    effect(() => {
      const data = this.menuService.menuData();
      if (data) {
        this.restaurant.set(data.restaurant);
        this.categories.set(data.categories);
        this.populateSettings(data.restaurant);
      }
    });
  }

  ngOnInit(): void {
    this.menuService.loadMenuBySlug('tacos-el-pastor');
  }

  populateSettings(r: Restaurant): void {
    this.editName = r.name;
    this.editSlug = r.slug;
    this.editWhatsapp = r.whatsapp_number;
    this.editLogo = r.logo_url || '';
    this.editDeliveryFee = r.delivery_fee || 0;
    this.editAllowsTable = r.allows_table_order;
    this.editAllowsTakeaway = r.allows_takeaway;
    this.editAllowsDelivery = r.allows_delivery;
  }

  getMenuFullUrl(): string {
    const slug = this.restaurant()?.slug || 'tacos-el-pastor';
    return `${window.location.origin}/menu/${slug}`;
  }

  getQrUrl(): string {
    const fullUrl = this.getMenuFullUrl();
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(fullUrl)}`;
  }

  downloadQr(): void {
    const link = document.createElement('a');
    link.href = this.getQrUrl();
    link.download = `QR_Menu_${this.restaurant()?.slug || 'gastrolink'}.png`;
    link.target = '_blank';
    link.click();
  }

  printQr(): void {
    window.print();
  }

  getTotalProducts(): number {
    return this.categories().reduce((acc, cat) => acc + cat.products.length, 0);
  }

  toggleAvailability(product: Product): void {
    const newStatus = !product.is_available;
    product.is_available = newStatus;

    this.adminService.updateProduct(product.id, { is_available: newStatus }).subscribe({
      next: () => console.log('Estado de producto actualizado en Supabase'),
      error: err => console.warn('Front actualizó localmente (API offline/fallback)', err)
    });
  }

  deleteProduct(productId: string): void {
    if (!confirm('¿Estás seguro de que deseas eliminar este platillo?')) return;

    this.categories.update(cats => 
      cats.map(cat => ({
        ...cat,
        products: cat.products.filter(p => p.id !== productId)
      }))
    );

    this.adminService.deleteProduct(productId).subscribe({
      next: () => console.log('Producto eliminado de Supabase'),
      error: err => console.warn('Producto eliminado localmente', err)
    });
  }

  openAddProductModal(): void {
    if (this.categories().length > 0) {
      this.newProductCategoryId = this.categories()[0].id;
    }
    this.showAddModal = true;
  }

  saveNewProduct(): void {
    if (!this.newProductName || this.newProductPrice <= 0) return;

    const newProdPayload = {
      category_id: this.newProductCategoryId,
      name: this.newProductName,
      price: this.newProductPrice,
      description: this.newProductDescription,
      image_url: this.newProductImageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80',
      is_available: true
    };

    const tempProd: Product = {
      ...newProdPayload,
      id: 'prod-' + Date.now(),
      created_at: new Date().toISOString()
    };

    this.categories.update(cats =>
      cats.map(cat => {
        if (cat.id === this.newProductCategoryId) {
          return { ...cat, products: [...cat.products, tempProd] };
        }
        return cat;
      })
    );

    this.adminService.createProduct(newProdPayload).subscribe({
      next: created => console.log('Producto guardado exitosamente en Supabase:', created),
      error: err => console.warn('Guardado local', err)
    });

    this.newProductName = '';
    this.newProductPrice = 0;
    this.newProductDescription = '';
    this.newProductImageUrl = '';
    this.showAddModal = false;
  }

  // --- EDIT PRODUCT METHODS ---
  openEditProductModal(product: Product): void {
    this.editingProductId = product.id;
    this.editProductCategoryId = product.category_id;
    this.editProductName = product.name;
    this.editProductPrice = product.price;
    this.editProductDescription = product.description || '';
    this.editProductImageUrl = product.image_url || '';
    this.showEditModal = true;
  }

  saveEditedProduct(): void {
    if (!this.editingProductId || !this.editProductName || this.editProductPrice <= 0) return;

    const updates: Partial<Product> = {
      category_id: this.editProductCategoryId,
      name: this.editProductName,
      price: this.editProductPrice,
      description: this.editProductDescription,
      image_url: this.editProductImageUrl
    };

    // Actualización reactiva instantánea en la interfaz
    this.categories.update(cats =>
      cats.map(cat => ({
        ...cat,
        products: cat.products.map(prod => {
          if (prod.id === this.editingProductId) {
            return { ...prod, ...updates };
          }
          return prod;
        })
      }))
    );

    // Persistir cambios en Supabase vía FastAPI
    this.adminService.updateProduct(this.editingProductId, updates).subscribe({
      next: updated => console.log('Producto actualizado en Supabase:', updated),
      error: err => console.warn('Producto actualizado localmente', err)
    });

    this.showEditModal = false;
  }

  saveSettings(): void {
    if (!this.restaurant()) return;
    const updated: Restaurant = {
      ...this.restaurant()!,
      name: this.editName,
      slug: this.editSlug,
      whatsapp_number: this.editWhatsapp,
      logo_url: this.editLogo,
      delivery_fee: this.editDeliveryFee,
      allows_table_order: this.editAllowsTable,
      allows_takeaway: this.editAllowsTakeaway,
      allows_delivery: this.editAllowsDelivery
    };
    this.restaurant.set(updated);

    this.adminService.updateRestaurant(updated.id, updated).subscribe({
      next: () => alert('Configuración guardada correctamente en la base de datos.'),
      error: () => alert('Configuración guardada localmente.')
    });
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';
    }
  }
}
