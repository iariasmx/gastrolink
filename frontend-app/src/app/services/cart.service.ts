import { Injectable, signal, computed } from "@angular/core";
import {
  CartItem,
  ServiceType,
  CheckoutDetails,
  SelectedModifier,
} from "../models/cart.model";
import { Product, Restaurant } from "../models/restaurant.model";

@Injectable({
  providedIn: "root",
})
export class CartService {
  // Signals para el estado del carrito
  readonly items = signal<CartItem[]>([]);
  readonly serviceType = signal<ServiceType>("table");
  readonly deliveryFee = signal<number>(0);

  // Signals computadas para cálculos reactivos
  readonly totalItemsCount = computed(() =>
    this.items().reduce((acc, item) => acc + item.quantity, 0),
  );

  readonly subtotal = computed(() =>
    this.items().reduce((acc, item) => {
      const modifiersCost =
        item.selected_modifiers?.reduce(
          (sum, mod) => sum + mod.price_extra,
          0,
        ) || 0;
      return acc + (item.product.price + modifiersCost) * item.quantity;
    }, 0),
  );

  readonly grandTotal = computed(() => {
    const fee = this.serviceType() === "delivery" ? this.deliveryFee() : 0;
    return this.subtotal() + fee;
  });

  /**
   * Agrega un producto al carrito.
   */
  addItem(
    product: Product,
    selectedModifiers: SelectedModifier[] = [],
    notes?: string,
  ): void {
    const current = this.items();
    const existingIndex = current.findIndex(
      (i) =>
        i.product.id === product.id &&
        this.areModifiersEqual(i.selected_modifiers || [], selectedModifiers),
    );

    if (existingIndex > -1) {
      const updated = [...current];
      updated[existingIndex] = {
        ...updated[updated.length - updated.length + existingIndex], // Forma segura de clonar
        quantity: updated[existingIndex].quantity + 1,
        notes: notes ?? updated[existingIndex].notes,
      };
      this.items.set(updated);
    } else {
      this.items.set([
        ...current,
        {
          product,
          quantity: 1,
          notes,
          selected_modifiers: selectedModifiers,
        },
      ]);
    }
  }

  /**
   * Actualiza la cantidad. Si se mandan 2 argumentos desde el HTML viejo, selectedModifiers se vuelve opcional de forma interna.
   */
  updateQuantity(
    productId: string,
    quantityOrModifiers: number | SelectedModifier[],
    maybeQuantity?: number,
  ): void {
    let targetModifiers: SelectedModifier[] = [];
    let newQuantity = 0;

    // Detectamos si nos invocaron con el formato viejo (id, cantidad) o el nuevo (id, modificadores, cantidad)
    if (Array.isArray(quantityOrModifiers)) {
      targetModifiers = quantityOrModifiers;
      newQuantity = maybeQuantity ?? 0;
    } else {
      targetModifiers = []; // Arreglo vacío por defecto para el HTML viejo
      newQuantity = quantityOrModifiers;
    }

    if (newQuantity <= 0) {
      this.removeItem(productId, targetModifiers);
      return;
    }

    const updated = this.items().map((item) =>
      item.product.id === productId &&
      this.areModifiersEqual(item.selected_modifiers || [], targetModifiers)
        ? { ...item, quantity: newQuantity }
        : item,
    );
    this.items.set(updated);
  }

  /**
   * Elimina un artículo del carrito. Soporta formato viejo llamando solo al ID.
   */
  removeItem(
    productId: string,
    selectedModifiers: SelectedModifier[] = [],
  ): void {
    this.items.set(
      this.items().filter(
        (item) =>
          !(
            item.product.id === productId &&
            this.areModifiersEqual(
              item.selected_modifiers || [],
              selectedModifiers,
            )
          ),
      ),
    );
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
   * Genera el payload para enviar a FastAPI
   */
  getCheckoutPayload(restaurantSlug: string, checkout: CheckoutDetails) {
    return {
      restaurant_slug: restaurantSlug,
      service_type: checkout.serviceType,
      table_number: checkout.tableNumber || null,
      customer_name: checkout.customerName,
      customer_phone: checkout.customerPhone,
      delivery_address: checkout.deliveryAddress || null,
      address_references: checkout.addressReferences || null,
      payment_method: checkout.paymentMethod,
      items: this.items().map((item) => ({
        product_id: item.product.id,
        product_name: item.product.name,
        price: item.product.price,
        quantity: item.quantity,
        notes: item.notes || null,
        selected_modifiers: (item.selected_modifiers || []).map((mod) => ({
          modifier_option_id: mod.modifier_option_id,
          name: mod.name,
          price_extra: mod.price_extra,
        })),
      })),
    };
  }

  /**
   * Re-inyectamos el método local para que CartDrawer compile sin modificar sus líneas de código
   */
  buildWhatsAppUrl(restaurant: Restaurant, checkout: CheckoutDetails): string {
    const restaurantPhone = restaurant.whatsapp_number.replace(/\D/g, "");
    const lines: string[] = [
      `*NUEVO PEDIDO - ${restaurant.name}*`,
      `----------------------------------`,
      `*Cliente:* ${checkout.customerName}`,
      `*Teléfono:* ${checkout.customerPhone}`,
      `*Modalidad:* ${checkout.serviceType.toUpperCase()}`,
    ];

    if (checkout.serviceType === "table" && checkout.tableNumber) {
      lines.push(`*Mesa:* ${checkout.tableNumber}`);
    } else if (checkout.serviceType === "delivery") {
      lines.push(
        `*Dirección:* ${checkout.deliveryAddress || "No especificada"}`,
      );
      if (checkout.addressReferences) {
        lines.push(`*Referencias:* ${checkout.addressReferences}`);
      }
    }

    lines.push(`*Método de pago:* ${checkout.paymentMethod}`);
    lines.push(`----------------------------------`);
    lines.push(`*DETALLE DEL PEDIDO:*`);

    this.items().forEach((item, index) => {
      const modsCost =
        item.selected_modifiers?.reduce((s, m) => s + m.price_extra, 0) || 0;
      const itemTotal = (item.product.price + modsCost) * item.quantity;

      let line = `${index + 1}. ${item.quantity}x ${item.product.name} - $${itemTotal.toFixed(2)}`;

      item.selected_modifiers?.forEach((mod) => {
        line += `\n    └─ _${mod.name}_`;
      });

      if (item.notes) {
        line += `\n    _(Nota: ${item.notes})_`;
      }
      lines.push(line);
    });

    lines.push(`----------------------------------`);
    lines.push(`*Subtotal:* $${this.subtotal().toFixed(2)}`);
    if (checkout.serviceType === "delivery" && this.deliveryFee() > 0) {
      lines.push(`*Costo de envío:* $${this.deliveryFee().toFixed(2)}`);
    }
    lines.push(`*TOTAL:* $${this.grandTotal().toFixed(2)}`);
    lines.push(`\n¡Gracias por atender mi pedido!`);

    const fullMessage = lines.join("\n");
    return `https://wa.me/${restaurantPhone}?text=${encodeURIComponent(fullMessage)}`;
  }

  private areModifiersEqual(
    mod1: SelectedModifier[],
    mod2: SelectedModifier[],
  ): boolean {
    if (!mod1 || !mod2) return mod1 === mod2;
    if (mod1.length !== mod2.length) return false;
    const ids1 = mod1.map((m) => m.modifier_option_id).sort();
    const ids2 = mod2.map((m) => m.modifier_option_id).sort();
    return ids1.every((id, index) => id === ids2[index]);
  }
}
