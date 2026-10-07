import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MenuService } from '../../services/menu.service';
import { CartService } from '../../services/cart.service';
import { CartDrawerComponent } from '../cart-drawer/cart-drawer.component';
import { Product } from '../../models/restaurant.model';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, CartDrawerComponent],
  template: `
    <div class="menu-container">
      <!-- Loading State -->
      <div *ngIf="menuService.loading()" class="loading-state">
        <div class="spinner"></div>
        <p>Preparando una experiencia deliciosa...</p>
      </div>

      <!-- Content -->
      <div *ngIf="!menuService.loading() && menuService.menuData()" class="menu-content">
        <!-- Hero Header con Colores Cálidos Estimulantes del Apetito -->
        <header class="restaurant-hero">
          <div class="hero-glow"></div>
          <div class="hero-content">
            <img 
              *ngIf="menuService.menuData()?.restaurant?.logo_url" 
              [src]="menuService.menuData()?.restaurant?.logo_url" 
              [alt]="menuService.menuData()?.restaurant?.name"
              class="restaurant-logo"
            />
            <div class="restaurant-info">
              <span class="welcome-badge">🔥 ¡Menú Digital Disponible!</span>
              <h1>{{ menuService.menuData()?.restaurant?.name }}</h1>
              <p class="tagline">Selecciona tus platillos favoritos y ordena directo por WhatsApp</p>
            </div>
          </div>
        </header>

        <!-- Category Tabs Bar -->
        <nav class="categories-bar">
          <div class="categories-scroll">
            <button 
              *ngFor="let cat of menuService.menuData()?.categories; let first = first" 
              [class.active]="activeCategoryId === cat.id || (first && !activeCategoryId)"
              (click)="scrollToCategory(cat.id)"
              class="category-tab">
              {{ cat.name }}
            </button>
          </div>
        </nav>

        <!-- Main Products Grid View -->
        <main class="menu-main">
          <section 
            *ngFor="let cat of menuService.menuData()?.categories" 
            [id]="cat.id" 
            class="category-section">
            <div class="category-header">
              <h2 class="category-title">{{ cat.name }}</h2>
              <span class="category-count">{{ cat.products.length }} delicias</span>
            </div>

            <div class="products-grid">
              <article *ngFor="let product of cat.products" class="product-card">
                <div class="product-img-wrapper" *ngIf="product.image_url">
                  <img [src]="product.image_url" (error)="onImageError($event)" [alt]="product.name" loading="lazy" />
                  <span class="flavor-tag">Popular 🌶️</span>
                </div>
                
                <div class="product-details">
                  <div class="product-info-top">
                    <div class="product-title-row">
                      <h3 class="product-title">{{ product.name }}</h3>
                      <span class="product-price">\${{ product.price | number:'1.2-2' }}</span>
                    </div>
                    
                    <p class="product-description" *ngIf="product.description">
                      {{ product.description }}
                    </p>
                  </div>

                  <div class="product-actions">
                    <button class="add-btn" (click)="addToCart(product)">
                      <span>+ Añadir al Pedido</span>
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </main>

        <!-- Floating Cart Bar con Alto Contraste y Gradiente Cálido -->
        <div *ngIf="cartService.totalItemsCount() > 0" class="floating-cart-bar">
          <div class="cart-summary" (click)="isCartOpen = true">
            <div class="cart-badge">
              <span>{{ cartService.totalItemsCount() }}</span>
            </div>
            <div class="cart-text">
              <span class="view-cart-label">Tu Carrito</span>
              <span class="cart-total">\${{ cartService.subtotal() | number:'1.2-2' }} MXN</span>
            </div>
          </div>
          <button class="checkout-action-btn" (click)="isCartOpen = true">
            <span>Completar Pedido</span>
            <span class="arrow-icon">➔</span>
          </button>
        </div>

        <!-- Drawer -->
        <app-cart-drawer 
          [isOpen]="isCartOpen" 
          [restaurant]="menuService.menuData()?.restaurant || null"
          (close)="isCartOpen = false">
        </app-cart-drawer>
      </div>
    </div>
  `,
  styles: [`
    /* 
      PSICOLOGÍA DEL COLOR APLICADA:
      - Rojo Carmesí/Coral (#e11d48, #f43f5e): Estimula el apetito y la frecuencia cardíaca (impulso de compra).
      - Ámbar Cálido (#f59e0b, #d97706): Despierta sensaciones de sabor, tostado artesanal y calidad.
      - Fondo Cálido Marmolado (#fafaf9): Higiénico pero acogedor, evita la frialdad estéril del blanco puro.
    */

    .menu-container {
      min-height: 100vh;
      background-color: #fafaf9;
      color: #1c1917;
      font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      padding-bottom: 110px;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      color: #78716c;
    }

    .spinner {
      width: 44px;
      height: 44px;
      border: 4px solid #e7e5e4;
      border-top-color: #e11d48;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 1rem;
    }

    /* Hero Banner - Gradiente Cálido Profundo con destellos ámbar */
    .restaurant-hero {
      position: relative;
      background: linear-gradient(135deg, #1c1917 0%, #2e1014 45%, #431407 100%);
      color: #ffffff;
      padding: 3.25rem 1.5rem 2.75rem;
      border-bottom-left-radius: 32px;
      border-bottom-right-radius: 32px;
      box-shadow: 0 14px 35px rgba(67, 20, 7, 0.25);
      overflow: hidden;
      -webkit-mask-image: -webkit-radial-gradient(white, black);
      transform: translateZ(0);
    }

    .hero-glow {
      position: absolute;
      top: -50px;
      right: -50px;
      width: 250px;
      height: 250px;
      background: radial-gradient(circle, rgba(245, 158, 11, 0.25) 0%, rgba(0,0,0,0) 70%);
      pointer-events: none;
    }

    .hero-content {
      max-width: 960px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 1.85rem;
      position: relative;
      z-index: 10;
    }

    .restaurant-logo {
      width: 105px;
      height: 105px;
      border-radius: 26px;
      object-fit: cover;
      border: 3.5px solid rgba(253, 230, 138, 0.4);
      box-shadow: 0 10px 25px rgba(245, 158, 11, 0.3);
      flex-shrink: 0;
    }

    .restaurant-info {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }

    .welcome-badge {
      display: inline-block;
      align-self: flex-start;
      background: rgba(225, 29, 72, 0.2);
      border: 1px solid rgba(244, 63, 94, 0.4);
      color: #fecdd3;
      font-size: 0.78rem;
      font-weight: 700;
      padding: 0.25rem 0.75rem;
      border-radius: 20px;
      margin-bottom: 0.5rem;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .restaurant-info h1 {
      margin: 0;
      font-size: 2.35rem;
      font-weight: 800;
      letter-spacing: -0.5px;
      line-height: 1.15;
      background: linear-gradient(135deg, #ffffff 0%, #fef3c7 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .tagline {
      margin: 0.45rem 0 0;
      color: #d6d3d1;
      font-size: 1rem;
      font-weight: 500;
    }

    /* Navbar Categorías Sticky */
    .categories-bar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(250, 250, 249, 0.95);
      backdrop-filter: blur(14px);
      border-bottom: 1px solid #e7e5e4;
      padding: 0.9rem 1rem;
      margin-bottom: 2.25rem;
      box-shadow: 0 4px 15px rgba(28, 25, 23, 0.04);
    }

    .categories-scroll {
      max-width: 960px;
      margin: 0 auto;
      display: flex;
      gap: 0.85rem;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .categories-scroll::-webkit-scrollbar {
      display: none;
    }

    .category-tab {
      white-space: nowrap;
      padding: 0.7rem 1.35rem;
      border-radius: 26px;
      border: 1.5px solid #e7e5e4;
      background: #ffffff;
      color: #57534e;
      font-size: 0.92rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.22s ease;
    }

    .category-tab:hover {
      border-color: #f43f5e;
      color: #e11d48;
    }

    .category-tab.active {
      background: linear-gradient(135deg, #e11d48 0%, #be123c 100%);
      color: #ffffff;
      border-color: #e11d48;
      box-shadow: 0 6px 18px rgba(225, 29, 72, 0.35);
    }

    /* Main Grid Layout & Distribution */
    .menu-main {
      max-width: 960px;
      margin: 0 auto;
      padding: 0 1.25rem;
    }

    .category-section {
      margin-bottom: 3.25rem;
      scroll-margin-top: 95px;
    }

    .category-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 1.35rem;
      padding-bottom: 0.65rem;
      border-bottom: 2.5px solid #f59e0b;
    }

    .category-title {
      font-size: 1.5rem;
      font-weight: 800;
      color: #1c1917;
      margin: 0;
      letter-spacing: -0.3px;
    }

    .category-count {
      font-size: 0.85rem;
      color: #78716c;
      font-weight: 700;
    }

    .products-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.6rem;
    }

    .product-card {
      background: #ffffff;
      border-radius: 22px;
      overflow: hidden;
      -webkit-mask-image: -webkit-radial-gradient(white, black);
      transform: translateZ(0);
      box-shadow: 0 6px 20px rgba(28, 25, 23, 0.06);
      border: 1px solid #e7e5e4;
      display: flex;
      flex-direction: column;
      transition: transform 0.25s ease, box-shadow 0.25s ease;
    }

    .product-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 14px 30px rgba(225, 29, 72, 0.12);
      border-color: #fecdd3;
    }

    .product-img-wrapper {
      width: 100%;
      height: 185px;
      overflow: hidden;
      position: relative;
      border-top-left-radius: 22px;
      border-top-right-radius: 22px;
      -webkit-mask-image: -webkit-radial-gradient(white, black);
    }

    .product-img-wrapper img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.4s ease;
    }

    .product-card:hover .product-img-wrapper img {
      transform: scale(1.06);
    }

    .flavor-tag {
      position: absolute;
      top: 12px;
      right: 12px;
      background: rgba(28, 25, 23, 0.75);
      backdrop-filter: blur(8px);
      color: #fef08a;
      font-size: 0.72rem;
      font-weight: 800;
      padding: 0.25rem 0.6rem;
      border-radius: 14px;
      border: 1px solid rgba(254, 240, 138, 0.3);
    }

    .product-details {
      padding: 1.35rem;
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 1.1rem;
    }

    .product-info-top {
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
    }

    .product-title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .product-title {
      margin: 0;
      font-size: 1.12rem;
      font-weight: 800;
      color: #1c1917;
      line-height: 1.3;
    }

    /* Precio con estilo Ámbar Dorado Llamativo */
    .product-price {
      background: #fffbe6;
      color: #b45309;
      font-weight: 800;
      font-size: 1.05rem;
      padding: 0.35rem 0.75rem;
      border-radius: 12px;
      border: 1px solid #fde68a;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(245, 158, 11, 0.15);
    }

    .product-description {
      margin: 0;
      font-size: 0.88rem;
      color: #78716c;
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .product-actions {
      display: flex;
      justify-content: flex-end;
      align-items: center;
    }

    /* Botón CTA de Alta Conversión en Rojo Carmesí */
    .add-btn {
      width: 100%;
      background: linear-gradient(135deg, #e11d48 0%, #be123c 100%);
      color: #ffffff;
      border: none;
      padding: 0.75rem 1.25rem;
      border-radius: 14px;
      font-size: 0.95rem;
      font-weight: 800;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      transition: all 0.2s ease;
      box-shadow: 0 6px 16px rgba(225, 29, 72, 0.3);
    }

    .add-btn:hover {
      background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%);
      transform: translateY(-2px);
      box-shadow: 0 8px 22px rgba(225, 29, 72, 0.45);
    }

    /* Barra Flotante del Carrito en Carmesí y Oscuro Premium */
    .floating-cart-bar {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      width: calc(100% - 32px);
      max-width: 500px;
      background: linear-gradient(135deg, #1c1917 0%, #2e1014 100%);
      color: #ffffff;
      border-radius: 22px;
      padding: 0.9rem 1.4rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 18px 45px rgba(225, 29, 72, 0.35);
      border: 1px solid rgba(244, 63, 94, 0.3);
      z-index: 900;
      animation: popUp 0.25s ease-out;
    }

    .cart-summary {
      display: flex;
      align-items: center;
      gap: 0.95rem;
      cursor: pointer;
    }

    .cart-badge {
      background: #e11d48;
      color: #ffffff;
      font-weight: 800;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      box-shadow: 0 4px 12px rgba(225, 29, 72, 0.4);
    }

    .cart-text {
      display: flex;
      flex-direction: column;
    }

    .view-cart-label {
      font-size: 0.72rem;
      color: #fecdd3;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      font-weight: 800;
    }

    .cart-total {
      font-weight: 800;
      font-size: 1.1rem;
      color: #ffffff;
    }

    .checkout-action-btn {
      background: linear-gradient(135deg, #25d366 0%, #16a34a 100%);
      color: #ffffff;
      border: none;
      padding: 0.7rem 1.35rem;
      border-radius: 14px;
      font-weight: 800;
      font-size: 0.95rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.55rem;
      box-shadow: 0 6px 16px rgba(37, 211, 102, 0.35);
      transition: transform 0.15s;
    }

    .checkout-action-btn:hover {
      transform: scale(1.03);
    }

    @media (max-width: 640px) {
      .restaurant-hero {
        padding: 2.5rem 1rem 2.25rem;
      }

      .hero-content {
        flex-direction: column;
        text-align: center;
        gap: 1rem;
      }

      .welcome-badge {
        align-self: center;
      }

      .restaurant-logo {
        width: 90px;
        height: 90px;
      }

      .restaurant-info h1 {
        font-size: 1.85rem;
      }

      .products-grid {
        grid-template-columns: 1fr;
      }
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    @keyframes popUp {
      from { transform: translate(-50%, 40px); opacity: 0; }
      to { transform: translate(-50%, 0); opacity: 1; }
    }
  `]
})
export class MenuComponent implements OnInit {
  menuService = inject(MenuService);
  cartService = inject(CartService);
  route = inject(ActivatedRoute);

  isCartOpen = false;
  activeCategoryId = '';

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const slug = params['slug'] || 'tacos-el-pastor';
      this.menuService.loadMenuBySlug(slug);
    });
  }

  scrollToCategory(catId: string): void {
    this.activeCategoryId = catId;
    const el = document.getElementById(catId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }

  addToCart(product: Product): void {
    this.cartService.addItem(product);
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=400&q=80';
    }
  }
}
