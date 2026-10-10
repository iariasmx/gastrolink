import { ServiceType } from "./cart.model";

export type OrderStatus =
  | "new"
  | "confirmed"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export interface OrderItemSnapshot {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  notes?: string | null;
  selected_modifiers: Array<{
    modifier_option_id: string;
    name: string;
    price_extra: number;
  }>;
}

export interface BusinessOrder {
  id: string;
  restaurant_id: string;
  customer_name: string;
  customer_phone: string;
  service_type: ServiceType;
  table_number?: string | null;
  delivery_address?: string | null;
  address_references?: string | null;
  payment_method: string;
  items: OrderItemSnapshot[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
  order_reference?: string;
  whatsapp_number?: string;
  message_text?: string;
  whatsapp_url?: string;
}

export interface CreateOrderPayload {
  idempotency_key: string;
  restaurant_slug: string;
  service_type: ServiceType;
  table_number?: string | null;
  customer_name: string;
  customer_phone: string;
  delivery_address?: string | null;
  address_references?: string | null;
  payment_method: string;
  items: Array<{
    product_id: string;
    quantity: number;
    notes?: string | null;
    selected_modifiers: Array<{ modifier_option_id: string }>;
  }>;
}
