import {
  Component,
  inject,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  input,
  output,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CartService } from "../../services/cart.service";
import { Restaurant } from "../../models/restaurant.model";
import { ServiceType, CheckoutDetails } from "../../models/cart.model";

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
    if (!restaurant) return;

    const details: CheckoutDetails = {
      serviceType: this.cartService.serviceType(),
      customerName: this.customerName,
      customerPhone: this.customerPhone,
      tableNumber: this.tableNumber || undefined,
      deliveryAddress: this.deliveryAddress || undefined,
      addressReferences: this.addressReferences || undefined,
      paymentMethod: this.paymentMethod as any,
    };

    const url = this.cartService.buildWhatsAppUrl(restaurant, details);
    window.open(url, "_blank");
  }
}
