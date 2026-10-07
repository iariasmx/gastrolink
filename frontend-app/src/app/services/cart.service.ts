import { Injectable, signal, computed } from '@angular/core';
import { CartItem, ServiceType, CheckoutDetails } from '../models/cart.model';
import { Product, Restaurant } from '../models/restaurant.model';

@Injectable({
  providedIn: 'root'
})
export class CartService {
  // Signals para el estado del carrito
  readonly items = signal<CartItem[]>([]);
  readonly serviceType = signal<ServiceType>('table');
  readonly deliveryFee = signal<number>(0);

  // Signals computadas para cálculos reactivos
  readonly totalItemsCount = computed(() =>
    this.items().reduce((acc, item) => acc + item.quantity, 0)
  );

  readonly subtotal = computed(() =>
    this.items().reduce((acc, item) => acc + item.product.price * item.quantity, 0)
  );

  readonly grandTotal = computed(() => {
    const fee = this.serviceType() === 'delivery' ? this.deliveryFee() : 0;
    return this.subtotal() + fee;
  });

  addItem(product: Product, notes?: string): void {
    const current = this.items();
    const existingIndex = current.findIndex(i => i.product.id === product.id);

    if (existingIndex > -1) {
      const updated = [...current];
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: updated[existingIndex].quantity + 1,
        notes: notes ?? updated[existingIndex].notes
      };
      this.items.set(updated);
    } else {
      this.items.set([...current, { product, quantity: 1, notes }]);
    }
  }

  updateQuantity(productId: string, quantity: number): void {
    if (quantity <= 0) {
      this.removeItem(productId);
      return;
    }
    const updated = this.items().map(item =>
      item.product.id === productId ? { ...item, quantity } : item
    );
    this.items.set(updated);
  }

  removeItem(productId: string): void {
    this.items.set(this.items().filter(item => item.product.id !== productId));
  }

  clearCart(): void {
    this.items.set([]);
  }

  setServiceType(type: ServiceType): void {
    this.serviceType.set(type);
  }

  setDeliveryFee(fee: number): void {
    this.deliveryFee.set(fee);
  }

  /**
   * Concatena el carrito y genera la URL directa para la API abierta de WhatsApp Web/App ($0 MXN API Cost)
   */
  buildWhatsAppUrl(restaurant: Restaurant, checkout: CheckoutDetails): string {
    const phone = restaurant.whatsapp_number.replace(/\+|\s|-/g, '');
    const lines: string[] = [
      `🛒 *NUEVO PEDIDO - ${restaurant.name}*`,
      `----------------------------------`,
      `👤 *Cliente:* ${checkout.customerName}`,
      `📞 *Teléfono:* ${checkout.customerPhone}`,
      `📍 *Modalidad:* ${checkout.serviceType.toUpperCase()}`
    ];

    if (checkout.serviceType === 'table' && checkout.tableNumber) {
      lines.push(`🪑 *Mesa:* ${checkout.tableNumber}`);
    } else if (checkout.serviceType === 'delivery') {
      lines.push(`🏠 *Dirección:* ${checkout.deliveryAddress || 'No especificada'}`);
      if (checkout.addressReferences) {
        lines.push(`ℹ️ *Referencias:* ${checkout.addressReferences}`);
      }
    }

    lines.push(`💳 *Pago:* ${checkout.paymentMethod}`);
    lines.push(`----------------------------------`);
    lines.push(`📋 *DETALLE DEL PEDIDO:*`);

    this.items().forEach((item, index) => {
      const itemTotal = item.product.price * item.quantity;
      let line = `${index + 1}. ${item.quantity}x ${item.product.name} - $${itemTotal.toFixed(2)}`;
      if (item.notes) {
        line += ` _(Nota: ${item.notes})_`;
      }
      lines.push(line);
    });

    lines.push(`----------------------------------`);
    lines.push(`💵 *Subtotal:* $${this.subtotal().toFixed(2)}`);
    if (checkout.serviceType === 'delivery' && this.deliveryFee() > 0) {
      lines.push(`🛵 *Costo Envío:* $${this.deliveryFee().toFixed(2)}`);
    }
    lines.push(`💰 *TOTAL:* $${this.grandTotal().toFixed(2)}`);
    lines.push(`\n¡Gracias por atender mi pedido!`);

    const fullMessage = lines.join('\n');
    return `https://wa.me/${phone}?text=${encodeURIComponent(fullMessage)}`;
  }
}
