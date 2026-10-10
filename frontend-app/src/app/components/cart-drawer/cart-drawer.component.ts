import {
  Component,
  inject,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  input,
  output,
  signal,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CartService } from "../../services/cart.service";
import { Restaurant } from "../../models/restaurant.model";
import { ServiceType, CheckoutDetails } from "../../models/cart.model";
import { OrderService } from "../../services/order.service";

@Component({
  selector: "app-cart-drawer",
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./cart-drawer.component.html",
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: "./cart-drawer.component.css",
})
export class CartDrawerComponent implements OnChanges {
  readonly isOpen = input(false);
  readonly restaurant = input<Restaurant | null>(null);
  readonly close = output<void>();

  cartService = inject(CartService);
  private orderService = inject(OrderService);
  submitting = signal(false);
  submitError = signal("");
  whatsappUrl = signal("");
  submissionKey = signal<string | null>(null);

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["restaurant"]) {
      this.cartService.setDeliveryFee(this.restaurant()?.delivery_fee ?? 0);
    }
  }

  customerName: string = "";
  customerPhone: string = "";
  tableNumber: string = "";
  deliveryAddress: string = "";
  addressReferences: string = "";
  paymentMethod: string = "Efectivo";

  getModifiersSubtotal(modifiers: any[] | undefined): number {
    if (!modifiers) return 0;
    return modifiers.reduce((sum, mod) => sum + (mod.price_extra || 0), 0);
  }

  isFormValid(): boolean {
    if (!this.customerName || !this.customerPhone) return false;
    if (this.cartService.serviceType() === "table" && !this.tableNumber)
      return false;
    if (this.cartService.serviceType() === "delivery" && !this.deliveryAddress)
      return false;
    return true;
  }

  sendOrderViaWhatsApp(): void {
    const restaurant = this.restaurant();
    if (!restaurant || this.submitting() || !this.isFormValid()) return;

    const details: CheckoutDetails = {
      serviceType: this.cartService.serviceType(),
      customerName: this.customerName,
      customerPhone: this.customerPhone,
      tableNumber: this.tableNumber || undefined,
      deliveryAddress: this.deliveryAddress || undefined,
      addressReferences: this.addressReferences || undefined,
      paymentMethod: this.paymentMethod as any,
    };

    this.submitting.set(true);
    this.submitError.set("");
    this.whatsappUrl.set("");
    const idempotencyKey = this.submissionKey() ?? crypto.randomUUID();
    this.submissionKey.set(idempotencyKey);
    const popup = window.open("about:blank", "_blank");
    this.orderService
      .create(this.cartService.getCheckoutPayload(restaurant.slug, details, idempotencyKey))
      .subscribe({
        next: (order) => {
          this.submitting.set(false);
          this.submissionKey.set(null);
          this.cartService.clearCart();
          this.whatsappUrl.set(order.whatsapp_url ?? "");
          if (popup && order.whatsapp_url) popup.location.href = order.whatsapp_url;
          else popup?.close();
        },
        error: (error) => {
          this.submitting.set(false);
          popup?.close();
          const detail =
            error?.error?.detail ?? error?.error?.message ?? error?.message;
          this.submitError.set(
            detail ||
              (error?.status === 0
                ? "No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo."
                : "No se pudo registrar el pedido. Intenta de nuevo."),
          );
        },
      });
  }
}
