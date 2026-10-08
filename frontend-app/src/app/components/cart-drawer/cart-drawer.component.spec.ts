import { TestBed } from "@angular/core/testing";
import { CartDrawerComponent } from "./cart-drawer.component";
import { CartService } from "../../services/cart.service";
import { Product, Restaurant } from "../../models/restaurant.model";

describe("Restaurant delivery fee", () => {
  it("updates the cart and WhatsApp totals when the restaurant or delivery mode changes", () => {
    const fixture = TestBed.createComponent(CartDrawerComponent);
    const cart = TestBed.inject(CartService);
    const restaurant: Restaurant = {
      id: "restaurant",
      name: "Restaurant",
      slug: "restaurant",
      whatsapp_number: "525530848005",
      allows_table_order: true,
      allows_takeaway: true,
      allows_delivery: true,
      delivery_fee: 35,
      minimum_order: 0,
      is_active: true,
    };
    const product: Product = {
      id: "taco",
      category_id: "tacos",
      name: "Taco",
      price: 26,
      is_available: true,
    };
    fixture.componentRef.setInput("restaurant", restaurant);
    fixture.detectChanges();
    cart.addItem(product, [
      { modifier_option_id: "cheese", name: "Cheese", price_extra: 12 },
    ]);
    cart.setServiceType("delivery");
    expect(cart.deliveryFee()).toBe(35);
    expect(cart.grandTotal()).toBe(73);
    const checkout = {
      serviceType: "delivery" as const,
      customerName: "Customer",
      customerPhone: "5512345678",
      paymentMethod: "Efectivo" as const,
    };
    const message = decodeURIComponent(
      cart.buildWhatsAppUrl(restaurant, checkout),
    );
    expect(message).toContain("*Costo de envío:* $35.00");
    expect(message).toContain("*TOTAL:* $73.00");
    const whatsappUrl = new URL(
      cart.buildWhatsAppUrl(restaurant, {
        ...checkout,
        customerName: "Iván",
        deliveryAddress: "Calle México #10",
        addressReferences: "Junto al café",
      }),
    );
    const whatsappText = whatsappUrl.searchParams.get("text")!;
    expect(whatsappText).toContain("*NUEVO PEDIDO - Restaurant*");
    expect(whatsappText).toContain("*Cliente:* Iván");
    expect(whatsappText).toContain("*Dirección:* Calle México #10");
    expect(whatsappText).toContain("*Referencias:* Junto al café");
    expect(whatsappText).toContain("*Costo de envío:* $35.00");
    expect(whatsappText).toContain("*TOTAL:* $73.00");
    expect(whatsappText).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(whatsappText).not.toMatch(/ðŸ|�|%F0%9F/);
    for (const mode of ["table", "takeaway"] as const) {
      cart.setServiceType(mode);
      expect(cart.grandTotal()).toBe(38);
      const pickupMessage = decodeURIComponent(
        cart.buildWhatsAppUrl(restaurant, { ...checkout, serviceType: mode }),
      );
      expect(pickupMessage).not.toContain("*Costo de envío:*");
      expect(pickupMessage).toContain("*TOTAL:* $38.00");
    }
    fixture.componentRef.setInput("restaurant", {
      ...restaurant,
      delivery_fee: 50,
    });
    fixture.detectChanges();
    cart.setServiceType("delivery");
    expect(cart.grandTotal()).toBe(88);
    fixture.componentRef.setInput("restaurant", null);
    fixture.detectChanges();
    expect(cart.deliveryFee()).toBe(0);
  });
});
