import { Product } from './restaurant.model';

// --- NUEVA INTERFAZ PARA IDENTIFICAR LOS EXTRAS ELEGIDOS ---
export interface SelectedModifier {
  modifier_option_id: string;
  name: string;
  price_extra: number;
}

// --- INTERFAZ ACTUALIZADA ENRIQUECIDA CON SUS MODIFICADORES ---
export interface CartItem {
  product: Product;
  quantity: number;
  notes?: string;
  selected_modifiers: SelectedModifier[]; // Campo obligatorio para rastrear variantes
}

export type ServiceType = 'table' | 'takeaway' | 'delivery';

export interface CheckoutDetails {
  serviceType: ServiceType;
  tableNumber?: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress?: string;
  addressReferences?: string;
  paymentMethod: string;
}

