import { Component, Input, Output, EventEmitter, inject, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CartService } from '../../services/cart.service';
import { Restaurant } from '../../models/restaurant.model';
import { ServiceType, CheckoutDetails } from '../../models/cart.model';

@Component({
  selector: 'app-cart-drawer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
   <div *ngIf="isOpen" class="drawer-overlay" (click)="close.emit()">
      <div class="drawer-content" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="drawer-header">
          <div class="header-title">
            <span class="cart-icon">🛒</span>
            <div>
              <h3>Tu Pedido</h3>
              <p class="sub-text">{{ cartService.totalItemsCount() }} productos seleccionados</p>
            </div>
          </div>
          <button class="close-btn" (click)="close.emit()">✕</button>
        </div>

        <!-- Body -->
        <div class="drawer-body">
          <!-- Item List -->
          <div *ngIf="cartService.items().length === 0" class="empty-cart">
            <span class="empty-icon">🍽️</span>
            <p>Tu carrito está vacío</p>
          </div>

          <div *ngIf="cartService.items().length > 0" class="items-list">
            <div *ngFor="let item of cartService.items()" class="cart-item">
              <div class="item-main-layout">
                <div class="item-info">
                  <span class="item-name">{{ item.product.name }}</span>
                  <!-- CALCULA EL TOTAL DE LA LÍNEA: (Precio base + modificadores) * cantidad -->
                  <span class="item-price">\${{ ((item.product.price + getModifiersSubtotal(item.selected_modifiers)) * item.quantity) | number:'1.2-2' }}</span>
                </div>

                <!-- 🟢 LISTADO VISUAL DE MODIFICADORES SELECCIONADOS -->
                <div *ngIf="item.selected_modifiers && item.selected_modifiers.length > 0" class="modifiers-list">
                  <div *ngFor="let mod of item.selected_modifiers" class="modifier-item">
                    └─ {{ mod.name }} 
                    <span *ngIf="mod.price_extra > 0" class="modifier-price">
                      (+\${{ mod.price_extra | number:'1.2-2' }})
                    </span>
                  </div>
                </div>

                <!-- Notas especiales -->
                <div *ngIf="item.notes" class="item-notes">
                  📝 <span>Nota: {{ item.notes }}</span>
                </div>
              </div>

              <div class="item-controls">
                <div class="qty-stepper">
                  <button (click)="cartService.updateQuantity(item.product.id, item.selected_modifiers, item.quantity - 1)">-</button>
                  <span>{{ item.quantity }}</span>
                  <button (click)="cartService.updateQuantity(item.product.id, item.selected_modifiers, item.quantity + 1)">+</button>
                </div>
                <button class="delete-btn" (click)="cartService.removeItem(item.product.id, item.selected_modifiers)" title="Eliminar">🗑️</button>
              </div>
            </div>

            <!-- Modalidad de Servicio -->
            <div class="service-selector">
              <label class="section-label">Modalidad de Entrega</label>
              <div class="service-tabs">
                <button 
                  *ngIf="restaurant?.allows_table_order"
                  [class.active]="cartService.serviceType() === 'table'"
                  (click)="cartService.setServiceType('table')">
                  🪑 En Mesa
                </button>
                <button 
                  *ngIf="restaurant?.allows_takeaway"
                  [class.active]="cartService.serviceType() === 'takeaway'"
                  (click)="cartService.setServiceType('takeaway')">
                  🛍️ Para Llevar
                </button>
                <button 
                  *ngIf="restaurant?.allows_delivery"
                  [class.active]="cartService.serviceType() === 'delivery'"
                  (click)="cartService.setServiceType('delivery')">
                  🛵 Domicilio
                </button>
              </div>
            </div>

            <!-- Formulario de Checkout -->
            <div class="checkout-form">
              <div class="form-group">
                <label>Nombre Completo *</label>
                <input type="text" [(ngModel)]="customerName" placeholder="Ej. Carlos Mendoza" required />
              </div>

              <div class="form-group">
                <label>Teléfono WhatsApp *</label>
                <input type="tel" [(ngModel)]="customerPhone" placeholder="Ej. 5512345678" required />
              </div>

              <div *ngIf="cartService.serviceType() === 'table'" class="form-group">
                <label>Número o Nombre de Mesa *</label>
                <input type="text" [(ngModel)]="tableNumber" placeholder="Ej. Mesa 4 / Terraza" />
              </div>

              <div *ngIf="cartService.serviceType() === 'delivery'" class="delivery-fields">
                <div class="form-group">
                  <label>Dirección Completa de Entrega *</label>
                  <input type="text" [(ngModel)]="deliveryAddress" placeholder="Calle, Número, Colonia" />
                </div>
                <div class="form-group">
                  <label>Referencias / Entrecalles</label>
                  <input type="text" [(ngModel)]="addressReferences" placeholder="Ej. Casa blanca con portón negro" />
                </div>
              </div>

              <div class="form-group">
                <label>Método de Pago</label>
                <select [(ngModel)]="paymentMethod">
                  <option value="Efectivo">Efectivo al recibir / en mesa</option>
                  <option value="Transferencia">Transferencia SPEI</option>
                </select>
              </div>
            </div>

            <!-- Resumen Financiero -->
            <div class="summary-card">
              <div class="summary-row">
                <span>Subtotal:</span>
                <span>\${{ cartService.subtotal() | number:'1.2-2' }}</span>
              </div>
              <div *ngIf="cartService.serviceType() === 'delivery'" class="summary-row">
                <span>Costo de Envío:</span>
                <span>\${{ cartService.deliveryFee() | number:'1.2-2' }}</span>
              </div>
              <div class="summary-row total-row">
                <span>Total a Pagar:</span>
                <span class="total-amount">\${{ cartService.grandTotal() | number:'1.2-2' }} MXN</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="drawer-footer" *ngIf="cartService.items().length > 0">
          <button 
            class="whatsapp-btn"
            [disabled]="!isFormValid()"
            (click)="sendOrderViaWhatsApp()">
            <span class="wa-icon">💬</span>
            <span>Enviar Pedido por WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .drawer-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.65);
      backdrop-filter: blur(4px);
      z-index: 1000;
      display: flex;
      justify-content: flex-end;
      animation: fadeIn 0.2s ease-out;
    }

    .drawer-content {
      width: 100%;
      max-width: 440px;
      height: 100%;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      box-shadow: -10px 0 30px rgba(0,0,0,0.2);
      animation: slideIn 0.25s ease-out;
    }

    .drawer-header {
      padding: 1.25rem 1.5rem;
      background: #0f172a;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .cart-icon {
      font-size: 1.5rem;
    }

    .drawer-header h3 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
    }

    .sub-text {
      margin: 0;
      font-size: 0.8rem;
      color: #94a3b8;
    }

    .close-btn {
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 1.5rem;
      cursor: pointer;
      padding: 0.25rem;
    }

    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
    }

    .empty-cart {
      text-align: center;
      padding: 4rem 1rem;
      color: #64748b;
    }

    .empty-icon {
      font-size: 3.5rem;
      display: block;
      margin-bottom: 1rem;
    }

    .cart-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.85rem 0;
      border-bottom: 1px solid #e2e8f0;
    }

    .item-info {
      display: flex;
      flex-direction: column;
    }

    .item-name {
      font-weight: 600;
      color: #1e293b;
      font-size: 0.95rem;
    }

    .item-price {
      font-size: 0.85rem;
      color: #059669;
      font-weight: 700;
    }

    .item-controls {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .qty-stepper {
      display: flex;
      align-items: center;
      background: #f1f5f9;
      border-radius: 8px;
      overflow: hidden;
    }

    .qty-stepper button {
      border: none;
      background: transparent;
      padding: 0.35rem 0.65rem;
      font-weight: 700;
      cursor: pointer;
      color: #334155;
    }

    .qty-stepper button:hover {
      background: #e2e8f0;
    }

    .qty-stepper span {
      padding: 0 0.5rem;
      font-size: 0.9rem;
      font-weight: 600;
    }

    .delete-btn {
      background: transparent;
      border: none;
      cursor: pointer;
      font-size: 1rem;
      opacity: 0.7;
    }

    .delete-btn:hover {
      opacity: 1;
    }

    .service-selector {
      margin-top: 1.5rem;
    }

    .section-label {
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #475569;
      display: block;
      margin-bottom: 0.5rem;
    }

    .service-tabs {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
      gap: 0.5rem;
    }

    .service-tabs button {
      padding: 0.6rem 0.5rem;
      border: 1.5px solid #cbd5e1;
      background: #ffffff;
      border-radius: 10px;
      font-size: 0.82rem;
      font-weight: 600;
      color: #475569;
      cursor: pointer;
      transition: all 0.2s;
    }

    .service-tabs button.active {
      border-color: #25d366;
      background: #f0fdf4;
      color: #15803d;
      font-weight: 700;
    }

    .checkout-form {
      margin-top: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .form-group label {
      font-size: 0.8rem;
      font-weight: 600;
      color: #334155;
    }

    .form-group input, .form-group select {
      padding: 0.65rem 0.85rem;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 0.9rem;
      outline: none;
    }

    .form-group input:focus, .form-group select:focus {
      border-color: #25d366;
      box-shadow: 0 0 0 3px rgba(37, 211, 102, 0.15);
    }

    .summary-card {
      margin-top: 1.5rem;
      background: #f8fafc;
      border-radius: 12px;
      padding: 1rem 1.25rem;
      border: 1px solid #e2e8f0;
    }

    .summary-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.9rem;
      color: #475569;
      margin-bottom: 0.4rem;
    }

    .total-row {
      margin-top: 0.6rem;
      padding-top: 0.6rem;
      border-top: 1px dashed #cbd5e1;
      font-weight: 700;
      color: #0f172a;
      font-size: 1.05rem;
    }

    .total-amount {
      color: #16a34a;
    }

    .drawer-footer {
      padding: 1.25rem 1.5rem;
      border-top: 1px solid #e2e8f0;
      background: #ffffff;
    }

    .whatsapp-btn {
      width: 100%;
      padding: 0.9rem;
      background: #25d366;
      color: #ffffff;
      border: none;
      border-radius: 12px;
      font-size: 1rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.6rem;
      box-shadow: 0 4px 14px rgba(37, 211, 102, 0.35);
      transition: transform 0.15s, background 0.15s;
    }

    .whatsapp-btn:hover:not(:disabled) {
      background: #20ba5a;
      transform: translateY(-1px);
    }

    .whatsapp-btn:disabled {
      background: #94a3b8;
      box-shadow: none;
      cursor: not-allowed;
    }

    @keyframes slideIn {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `]
})
export class CartDrawerComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() restaurant: Restaurant | null = null;
  @Output() close = new EventEmitter<void>();

  cartService = inject(CartService);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['restaurant']) {
      this.cartService.setDeliveryFee(this.restaurant?.delivery_fee ?? 0);
    }
  }

  customerName: string = '';
  customerPhone: string = '';
  tableNumber: string = '';
  deliveryAddress: string = '';
  addressReferences: string = '';
  paymentMethod: string = 'Efectivo';

  getModifiersSubtotal(modifiers: any[] | undefined): number {
    if (!modifiers) return 0;
    return modifiers.reduce((sum, mod) => sum + (mod.price_extra || 0), 0);
  }

  isFormValid(): boolean {
    if (!this.customerName || !this.customerPhone) return false;
    if (this.cartService.serviceType() === 'table' && !this.tableNumber) return false;
    if (this.cartService.serviceType() === 'delivery' && !this.deliveryAddress) return false;
    return true;
  }

  sendOrderViaWhatsApp(): void {
    if (!this.restaurant) return;

    const details: CheckoutDetails = {
      serviceType: this.cartService.serviceType(),
      customerName: this.customerName,
      customerPhone: this.customerPhone,
      tableNumber: this.tableNumber || undefined,
      deliveryAddress: this.deliveryAddress || undefined,
      addressReferences: this.addressReferences || undefined,
      paymentMethod: this.paymentMethod as any
    };

    const url = this.cartService.buildWhatsAppUrl(this.restaurant, details);
    window.open(url, '_blank');
  }
}
