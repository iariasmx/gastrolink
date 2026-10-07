import { Product } from './restaurant.model';

export interface CartItem {
  product: Product;
  quantity: number;
  notes?: string;
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
